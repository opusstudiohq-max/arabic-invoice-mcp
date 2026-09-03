/**
 * أداة الفاتورة الضريبية — تعمل كلها داخل المتصفّح.
 *
 * **لا خادم ولا رفع.** بيانات الفاتورة — الأسماء والمبالغ والرقم الضريبي —
 * لا تغادر جهاز المستعمل. وهذا ليس وعداً تسويقياً بل خاصية بنيوية: لا
 * يوجد في هذا الملف طلبُ شبكةٍ واحد يرسل شيئاً.
 *
 * والقطع كلها مبنيّة ومُختبَرة على حدة:
 *   نَسْق   — ترتيب النصّ العربي (bidi مطابق لـ٩١٬٧٠٧ حالة من يونيكود)
 *   فاتورة — المجاميع بالهللات ورمز QR من نصّ المواصفة
 */
import { renderInvoice, computeTotals, formatMinor } from "fatura-zatca";
// المحرّك يُستورد من البناء المشحون نفسه، لا يُنسخ — والنسخة تنحرف عن أصلها
// بلا أثر ظاهر، وهو الصنف الذي يحرسه `tafgeet-benchmark/tests/no-drift`.
import { tafgeet } from "../../arabic-invoice-mcp-ts/dist/tafgeet.js";

const $ = (id) => document.getElementById(id);
const state = { fontBytes: null, lastPdf: null, lastName: "invoice.pdf" };

// ── الخطّ ────────────────────────────────────────────────────────────────
//
// يُجلب مرّة ويُخزَّن في الذاكرة. وقِسنا ثمانية خطوط مرخَّصة فسقط نصفها
// بصرياً عبر pdf-lib؛ وهذا (Almarai، OFL) من الناجية، وتغطيته كاملة.
async function loadFont() {
  if (state.fontBytes) return state.fontBytes;
  const res = await fetch(new URL("./fonts/Almarai.ttf", document.baseURI));
  if (!res.ok) throw new Error(`تعذّر تحميل الخطّ (${res.status})`);
  state.fontBytes = new Uint8Array(await res.arrayBuffer());
  return state.fontBytes;
}

// ── البنود ───────────────────────────────────────────────────────────────
function lineRow(values = {}) {
  const row = document.createElement("div");
  row.className = "line";
  row.innerHTML = `
    <input class="desc"  type="text"   placeholder="البيان"   value="${values.description ?? ""}">
    <input class="qty"   type="number" step="any" min="0"     value="${values.quantity ?? 1}">
    <input class="price" type="number" step="0.01" min="0"    value="${values.price ?? ""}">
    <select class="vat">
      <option value="15">15%</option>
      <option value="5">5%</option>
      <option value="0">معفى</option>
    </select>
    <button class="drop" type="button" title="حذف البند" aria-label="حذف البند">×</button>`;
  row.querySelector(".vat").value = String(values.vatRate ?? 15);
  row.querySelector(".drop").addEventListener("click", () => {
    if ($("lines").children.length > 1) { row.remove(); refresh(); }
  });
  row.addEventListener("input", refresh);
  return row;
}

/** يقرأ النموذج ويبني كائن الفاتورة. المبالغ **بالهللات**. */
function readForm() {
  const lines = [...$("lines").children].map((row) => {
    const price = Number(row.querySelector(".price").value || 0);
    return {
      description: row.querySelector(".desc").value.trim() || "بند",
      quantity: Number(row.querySelector(".qty").value || 0) || 0,
      unitPrice: Math.round(price * 100),
      vatRate: Number(row.querySelector(".vat").value),
    };
  }).filter((l) => l.quantity > 0);

  const date = $("date").value || new Date().toISOString().slice(0, 10);
  const time = $("time").value || "12:00";
  return {
    number: $("number").value.trim() || "INV-1",
    // منطقة زمنية إلزامية في المواصفة؛ +03:00 توقيت السعودية
    issuedAt: `${date}T${time}:00+03:00`,
    currency: "SAR",
    kind: $("buyerName").value.trim() ? "standard" : "simplified",
    seller: {
      name: $("sellerName").value.trim() || "—",
      vatNumber: $("sellerVat").value.trim() || undefined,
      address: $("sellerAddress").value.trim() || undefined,
    },
    buyer: $("buyerName").value.trim()
      ? { name: $("buyerName").value.trim(), vatNumber: $("buyerVat").value.trim() || undefined }
      : undefined,
    lines,
    notes: $("notes").value.trim() || undefined,
  };
}

// ── العرض الحيّ ──────────────────────────────────────────────────────────
function refresh() {
  const invoice = readForm();
  const box = $("summary");
  if (!invoice.lines.length) {
    box.innerHTML = `<p class="hint">أضف بنداً بكمية أكبر من صفر.</p>`;
    $("build").disabled = true;
    return;
  }
  try {
    const t = computeTotals(invoice);
    const rows = t.vatByRate
      .map((v) => `<tr><td>ضريبة ${v.rate}%</td><td class="num">${formatMinor(v.vat)}</td></tr>`)
      .join("");
    box.innerHTML = `
      <table>
        <tr><td>المجموع قبل الضريبة</td><td class="num">${formatMinor(t.subtotal)}</td></tr>
        ${rows}
        <tr class="total"><td>الإجمالي شامل الضريبة</td><td class="num">${formatMinor(t.total)}</td></tr>
      </table>
      <p class="words">فقط ${tafgeet(t.total / 100, "SAR")} لا غير</p>`;
    $("build").disabled = false;
    setStatus("");
  } catch (e) {
    box.innerHTML = `<p class="error">${e.message}</p>`;
    $("build").disabled = true;
  }
}

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

// ── البناء ───────────────────────────────────────────────────────────────
async function build() {
  const invoice = readForm();
  setStatus("جارٍ البناء…");
  try {
    const fontBytes = await loadFont();
    const { pdf, qrPayload } = await renderInvoice(invoice, {
      fontBytes,
      amountInWords: (minor, currency) => tafgeet(minor / 100, currency),
    });
    state.lastPdf = pdf;
    state.lastName = `${invoice.number.replace(/[^\w.-]+/g, "-")}.pdf`;

    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    $("preview").src = url;
    $("preview").hidden = false;
    $("download").href = url;
    $("download").download = state.lastName;
    $("download").hidden = false;

    // بعد نجاح البناء وحده. `buyer` منطقيٌّ لا اسم، والبنودُ شريحةٌ لا عدد.
    if (typeof window.mtrack === "function") {
      const n = (invoice.lines || []).length;
      window.mtrack("invoice_made", {
        buyer: Boolean(invoice.buyer && invoice.buyer.name),
        lines: n <= 1 ? "1" : n <= 5 ? "2-5" : n <= 20 ? "6-20" : "20+",
      });
    }
    setStatus(qrPayload
      ? "جاهزة — ورمز QR للمرحلة الأولى مُدرَج."
      : "جاهزة — بلا رمز QR: رمزُ الهيئة يلزمه رقم ضريبي سعودي (15 رقماً يبدأ بـ3).",
      "ok");
  } catch (e) {
    setStatus(e.message, "error");
  }
}

// ── الإقلاع ──────────────────────────────────────────────────────────────
export function start() {
  const now = new Date();
  $("date").value = now.toISOString().slice(0, 10);
  $("time").value = now.toTimeString().slice(0, 5);
  $("lines").append(lineRow({ description: "", quantity: 1, price: "" }));
  $("addLine").addEventListener("click", () => { $("lines").append(lineRow()); refresh(); });
  $("build").addEventListener("click", build);
  document.querySelectorAll("input, textarea").forEach((el) => el.addEventListener("input", refresh));
  refresh();
}

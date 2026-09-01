/**
 * أداة طباعة الشيكات — منطق الواجهة.
 *
 * مبدأ حاكم: **لا تغادر بيانات المستخدم متصفحه.** لا شبكة، لا تحليلات،
 * لا رفع. ما يُحفظ محلياً هو **القوالب فقط** (مواضع الحقول)، ولا يُحفظ
 * مبلغ ولا اسم مستفيد إطلاقاً — يمكن للمستخدم التحقق بفتح تبويب الشبكة.
 */
import { tafgeet, chequeWords, CURRENCY_UNITS } from "./tafgeet.js";
import { LAYOUTS, FIELD_ORDER, cloneLayout } from "./layouts.js";

const STORE_KEY = "mutawafiq.cheque.templates.v1";
const $ = (id) => document.getElementById(id);

let layout = cloneLayout("eg-standard");
let selected = null;

// ── الحفظ المحلي (القوالب فقط) ──────────────────────────────────────────
const loadStore = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
};
const saveStore = (s) => localStorage.setItem(STORE_KEY, JSON.stringify(s));

function refreshTemplateList() {
  const sel = $("templateSelect");
  const saved = loadStore();
  sel.innerHTML = "";
  for (const [k, v] of Object.entries(LAYOUTS)) {
    sel.append(new Option(v.name, "builtin:" + k));
  }
  for (const k of Object.keys(saved)) {
    sel.append(new Option("💾 " + k, "saved:" + k));
  }
}

// ── تقسيم التفقيط على سطرين دون قطع كلمة ────────────────────────────────
function splitWords(text, maxChars) {
  if (text.length <= maxChars) return [text, ""];
  const words = text.split(" ");
  let first = "";
  for (const w of words) {
    if ((first + " " + w).trim().length > maxChars) break;
    first = (first + " " + w).trim();
  }
  return [first, text.slice(first.length).trim()];
}

// ── القيم الحالية ───────────────────────────────────────────────────────
const DEFAULT_CURRENCY = "EGP";

function readInputs() {
  // احتياط: لو لم تُهيّأ القائمة بعد أو حملت قيمة غير معروفة، لا ننهار.
  const picked = ($("currency").value || "").trim();
  const currency = picked in CURRENCY_UNITS ? picked : DEFAULT_CURRENCY;
  const raw = ($("amount").value || "").trim();
  const words = raw ? chequeWords(raw, currency) : "";
  const decimals = CURRENCY_UNITS[currency].decimals;
  const num = Number(raw);
  const digits = raw && isFinite(num)
    ? num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "";
  const [w1, w2] = splitWords(words, Number($("wrapAt").value) || 60);
  const payeeRaw = ($("payee").value || "").trim();
  return {
    date: $("date").value ? formatDate($("date").value) : "",
    payee: payeeRaw + ($("orOrder").checked && payeeRaw ? " أو لأمره" : ""),
    amountWords: w1,
    amountWords2: w2,
    amountDigits: digits ? `${digits} #` : "",
    _wordsFull: words,
  };
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d} / ${m} / ${y}`;
}

// ── الرسم ───────────────────────────────────────────────────────────────
function render() {
  const sheet = $("sheet");
  const vals = readInputs();
  const offX = Number($("offsetX").value) || 0;
  const offY = Number($("offsetY").value) || 0;

  sheet.style.width = layout.width + "mm";
  sheet.style.height = layout.height + "mm";
  sheet.innerHTML = "";

  const bg = $("bgImage").dataset.src;
  sheet.style.backgroundImage = bg ? `url(${bg})` : "none";

  for (const key of FIELD_ORDER) {
    const f = layout.fields[key];
    if (!f) continue;
    const el = document.createElement("div");
    el.className = "fld" + (selected === key ? " sel" : "");
    el.dataset.key = key;
    el.style.right = (f.x + offX) + "mm";
    el.style.top = (f.y + offY) + "mm";
    el.style.fontSize = f.size + "mm";
    el.textContent = vals[key] || "";
    if (!vals[key]) { el.classList.add("empty"); el.textContent = f.label; }
    sheet.append(el);
  }

  $("wordsPreview").textContent = vals._wordsFull || "—";
  $("hint").textContent = selected
    ? `المحدد: ${layout.fields[selected].label} — الأسهم تحرّكه، Shift+الأسهم تحريك دقيق`
    : "اضغط على أي حقل لتحديده، ثم اسحبه أو حرّكه بالأسهم";
}

// ── السحب ───────────────────────────────────────────────────────────────
let drag = null;
function mmPerPx() {
  const r = $("sheet").getBoundingClientRect();
  return layout.width / r.width;
}

$("sheet").addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".fld");
  if (!el) { selected = null; render(); return; }
  selected = el.dataset.key;
  drag = { x: e.clientX, y: e.clientY, f: { ...layout.fields[selected] } };
  el.setPointerCapture(e.pointerId);
  render();
});

$("sheet").addEventListener("pointermove", (e) => {
  if (!drag || !selected) return;
  const k = mmPerPx();
  const f = layout.fields[selected];
  f.x = Math.max(0, Math.round((drag.f.x - (e.clientX - drag.x) * k) * 10) / 10);
  f.y = Math.max(0, Math.round((drag.f.y + (e.clientY - drag.y) * k) * 10) / 10);
  render();
});

$("sheet").addEventListener("pointerup", () => { drag = null; });

document.addEventListener("keydown", (e) => {
  if (!selected || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const step = e.shiftKey ? 0.2 : 1;
  const f = layout.fields[selected];
  const moves = { ArrowRight: ["x", step], ArrowLeft: ["x", -step], ArrowDown: ["y", step], ArrowUp: ["y", -step] };
  if (moves[e.key]) {
    const [axis, d] = moves[e.key];
    f[axis] = Math.max(0, Math.round((f[axis] + d) * 10) / 10);
    e.preventDefault(); render();
  }
  if (e.key === "+" || e.key === "=") { f.size = Math.round((f.size + 0.2) * 10) / 10; render(); }
  if (e.key === "-") { f.size = Math.max(1, Math.round((f.size - 0.2) * 10) / 10); render(); }
});

// ── الأحداث ─────────────────────────────────────────────────────────────
["amount", "currency", "payee", "date", "wrapAt", "offsetX", "offsetY", "orOrder"]
  .forEach((id) => $(id).addEventListener("input", render));

$("templateSelect").addEventListener("change", (e) => {
  const [kind, key] = e.target.value.split(":");
  layout = kind === "saved" ? JSON.parse(JSON.stringify(loadStore()[key])) : cloneLayout(key);
  selected = null; render();
});

$("saveTemplate").addEventListener("click", () => {
  const name = ($("templateName").value || "").trim();
  if (!name) { alert("اكتب اسماً للقالب أولاً (مثل: البنك الأهلي — دفتر 2026)"); return; }
  const store = loadStore();
  store[name] = JSON.parse(JSON.stringify(layout));
  saveStore(store); refreshTemplateList();
  $("templateSelect").value = "saved:" + name;
  $("saveMsg").textContent = `حُفظ «${name}» في متصفحك.`;
  setTimeout(() => ($("saveMsg").textContent = ""), 4000);
});

$("deleteTemplate").addEventListener("click", () => {
  const v = $("templateSelect").value;
  if (!v.startsWith("saved:")) { alert("القوالب المدمجة لا تُحذف."); return; }
  const key = v.slice(6);
  if (!confirm(`حذف القالب «${key}» نهائياً؟`)) return;
  const store = loadStore(); delete store[key]; saveStore(store);
  refreshTemplateList(); layout = cloneLayout("eg-standard"); render();
});

$("bgFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => { $("bgImage").dataset.src = fr.result; render(); };
  fr.readAsDataURL(file);   // محلي بالكامل — لا يُرفع لأي خادم
});

$("clearBg").addEventListener("click", () => {
  $("bgImage").dataset.src = ""; $("bgFile").value = ""; render();
});

$("printBtn").addEventListener("click", () => {
  document.body.classList.add("printing");
  window.print();
  setTimeout(() => document.body.classList.remove("printing"), 500);
});

$("exportTemplates").addEventListener("click", () => {
  const data = JSON.stringify(loadStore(), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "cheque-templates.json"; a.click();
  URL.revokeObjectURL(url);
});

$("importTemplates").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const incoming = JSON.parse(fr.result);
      saveStore({ ...loadStore(), ...incoming });
      refreshTemplateList();
      $("saveMsg").textContent = `استُوردت ${Object.keys(incoming).length} قوالب.`;
    } catch { alert("الملف غير صالح."); }
  };
  fr.readAsText(file);
});

// ── الإقلاع ─────────────────────────────────────────────────────────────
$("date").value = new Date().toISOString().slice(0, 10);
refreshTemplateList();
render();

// نقطة وصول للاختبار الآلي وللمستخدم المتقدّم — لا ترسل شيئاً ولا تحفظ شيئاً.
window.__cheque = { tafgeet, chequeWords, readInputs, splitWords,
                    get layout() { return layout; } };

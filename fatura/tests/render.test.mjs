/**
 * فحص الفاتورة **من داخل الملف المُنتَج** — لا من مخرَج الدوال.
 *
 * وهذا هو الفرق العملي كله. حزمٌ منشورة تُخرج نصّاً صحيحاً من دوالّها ثم
 * تُنتج فاتورةً خاطئة، لأن مكتبة الرسم تعكس المقاطع بعدها. واختبارٌ يفحص
 * القيمة المُعادة يمرّ، والعميل يتسلّم مبلغاً مقلوباً.
 *
 * فهنا:
 *   · تُفكّ مجاري المحتوى وتُقرأ معرّفات الرسوم وتُردّ إلى محارفها
 *   · ويُعاد بناء رمز QR **من المستطيلات المرسومة فعلاً** على الصفحة، ثم
 *     يُفكّ بـ`jsqr` — قارئٌ مستقلّ لم نكتبه
 *
 *   node --test invoice-pdf/tests/render.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkitModule from "fontkit";
import jsQRModule from "jsqr";

import { renderInvoice } from "../dist/render.js";
import { decodeZatcaQr } from "../dist/zatca-qr.js";

const fk = fontkitModule.default ?? fontkitModule;
const jsQR = jsQRModule.default ?? jsQRModule;
const HERE = dirname(fileURLToPath(import.meta.url));

const FONT_PATH = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/tahoma.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  join(HERE, "fonts", "arabic.ttf"),
].find(existsSync);

const skip = { skip: FONT_PATH ? false : "لا يوجد خطّ عربي على هذا النظام" };
const fontBytes = FONT_PATH ? readFileSync(FONT_PATH) : null;
const analysed = fontBytes ? fk.create(fontBytes) : null;

const glyphToChar = new Map();
if (analysed) {
  for (let cp = 0x20; cp <= 0xfeff; cp++) {
    const g = analysed.glyphForCodePoint(cp);
    if (g && !glyphToChar.has(g.id)) glyphToChar.set(g.id, String.fromCodePoint(cp));
  }
}

const INVOICE = {
  number: "INV-2026-0042",
  issuedAt: "2026-09-01T13:45:00+03:00",
  currency: "SAR",
  kind: "simplified",
  seller: { name: "مؤسسة الأمل التجارية", vatNumber: "310122393500003", address: "الرياض" },
  lines: [
    { description: "استشارة برمجية", quantity: 2, unitPrice: 50000, vatRate: 15 },
    { description: "ترخيص سنوي",     quantity: 1, unitPrice: 34500, vatRate: 15 },
  ],
};

/** كل مجاري المحتوى في الملف، مفكوكة الضغط. */
function contentStreams(pdf) {
  const out = [];
  const end = Buffer.from("endstream");
  for (let i = 0; i < pdf.length - 6; i++) {
    if (pdf.subarray(i, i + 6).toString("latin1") !== "stream") continue;
    const start = pdf[i + 6] === 0x0d ? i + 8 : i + 7;
    const stop = pdf.indexOf(end, start);
    if (stop < 0) continue;
    const body = pdf.subarray(start, stop);
    try { out.push(zlib.inflateSync(body).toString("latin1")); }
    catch { out.push(body.toString("latin1")); }
    i = stop;
  }
  return out;
}

/** ما كُتب من نصّ في الملف، يساراً ← يميناً. */
function textInPdf(pdf) {
  let all = "";
  for (const stream of contentStreams(pdf)) {
    for (const m of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      all += (m[1].match(/..../g) ?? [])
        .map((h) => glyphToChar.get(parseInt(h, 16)) ?? "\uFFFD").join("") + "\n";
    }
  }
  // الرسوم العربية تعود **أشكالاً تقديمية** (U+FE70..U+FEFF) لأن ذلك ما
  // اختاره الخطّ فعلاً. فيُطبَّع الناتج ليعود إلى الحروف الأساسية، وإلا
  // قارنّا «شركة» بـ«ﺷﺮﻛﺔ» فأخفق اختبارٌ والكودُ سليم.
  return all.normalize("NFKC");
}

/**
 * طيّ صور الحرف الواحد.
 *
 * الخريطة العكسية (رسم ← محرف) **لا يمكن أن تكون دقيقة**: الخطّ يشارك
 * الرسم الواحد بين محارف. فرسم الياء الوسطى في Arial مشترَك بين `ي`
 * (U+064A) و`ی` الفارسية (U+06CC)، فتُعيد الخريطة أيّهما وجدت أولاً.
 *
 * فبدا أن «شركة النيل» لم تُطبع، والمطبوع «شركة النیل» — أي الحرف نفسه
 * والرسم نفسه. عيبٌ في أداة الفحص لا في المولّد. والطيّ يجعل التأكيد على
 * **ما ظهر وترتيبه**، وهو ما تستطيع هذه الأداة إثباته حقاً.
 */
function foldArabic(text) {
  return text
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")     // تشكيل وتطويل
    .replace(/[آأإٱ]/g, "ا")
    .replace(/[ىیے]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ک]/g, "ك");

}

/**
 * هل ظهرت هذه العبارة العربية على الصفحة؟
 *
 * المقطع العربي يُكتب بترتيبه **البصري** — أي معكوساً عن المنطقي — فيُبحث
 * عن العبارة معكوسة. وليس ذلك عيباً: هو الترتيب الصحيح على الورق.
 */
function showsArabic(pdf, phrase) {
  const visual = [...foldArabic(phrase)].reverse().join("");
  return foldArabic(textInPdf(pdf)).includes(visual);
}

/**
 * يُعيد بناء رمز QR من **المربّعات المرسومة فعلاً** على الصفحة.
 *
 * ولا تُرسم بمعامل `re`: تُصدر pdf-lib إزاحةً ثم مساراً —
 *
 *     1 0 0 1 <x> <y> cm
 *     1 0 0 1 0 0 cm        ← دوران (محايد)
 *     1 0 0 1 0 0 cm        ← ميلان (محايد)
 *     0 0 m
 *     0 <h> l
 *     <w> <h> l
 *     <w> 0 l
 *     h f
 *
 * وقد كتبتُ المحلّل أول مرّة على `re` فلم يجد شيئاً، فبدا العيب في
 * المولّد وهو في الاختبار. القراءة من الملف تكشف الاثنين.
 */
const RECT_PATH = /1 0 0 1 ([\d.-]+) ([\d.-]+) cm(?:\s*1 0 0 1 0 0 cm)*\s*0 0 m\s*0 ([\d.-]+) l\s*([\d.-]+) \3 l/g;

function qrFromDrawnRectangles(pdf) {
  const rects = [];
  for (const stream of contentStreams(pdf)) {
    for (const m of stream.matchAll(RECT_PATH)) {
      const [x, y, h, w] = [+m[1], +m[2], +m[3], +m[4]];
      if (Math.abs(w - h) < 0.01 && w > 0 && w < 12) rects.push({ x, y, size: w });
    }
  }
  if (rects.length < 40) return null;

  const module = rects[0].size;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x));
  const maxY = Math.max(...rects.map((r) => r.y));
  const count = Math.round((maxX - minX) / module) + 1;
  if (Math.round((maxY - minY) / module) + 1 !== count) return null;

  const dark = Array.from({ length: count }, () => new Array(count).fill(false));
  for (const r of rects) {
    const col = Math.round((r.x - minX) / module);
    // مبدأ إحداثيات PDF من الأسفل، والمصفوفة من الأعلى
    const row = count - 1 - Math.round((r.y - minY) / module);
    if (row >= 0 && row < count && col >= 0 && col < count) dark[row][col] = true;
  }

  // نقطية بهامش هادئ (4 وحدات) وتكبير — `jsqr` يحتاج الاثنين
  const scale = 4, quiet = 4;
  const side = (count + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!dark[row][col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((row + quiet) * scale + dy) * side + ((col + quiet) * scale + dx);
          data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return jsQR(data, side, side);
}

async function render(invoice = INVOICE, extra = {}) {
  const result = await renderInvoice(invoice, { fontBytes, ...extra });
  return { ...result, buffer: Buffer.from(result.pdf) };
}

// ── المال ────────────────────────────────────────────────────────────────
test("المبالغ تُطبع كما تُقرأ — لا مقلوبة", skip, async () => {
  const { buffer } = await render();
  const text = textInPdf(buffer);
  // 2×500.00 + 345.00 = 1,345.00 قبل الضريبة، و15% ⇒ 201.75، والإجمالي 1,546.75
  assert.ok(text.includes("1,546.75"), `الإجمالي لم يُطبع سليماً:\n${text}`);
  assert.ok(text.includes("1,345.00"), "المجموع قبل الضريبة لم يُطبع");
  assert.ok(text.includes("201.75"), "مبلغ الضريبة لم يُطبع");
  assert.ok(!text.includes("57.645,1"), "الإجمالي خرج مقلوباً");
  assert.ok(!text.includes("00.543,1"), "المجموع خرج مقلوباً");
});

test("رقم الفاتورة يبقى مقروءاً", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("INV-2026-0042"), `رقم الفاتورة انكسر:\n${text}`);
});

test("التاريخ يُطبع بالشرطة المائلة فينجو ترتيبه", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("2026/09/01"), `التاريخ انكسر:\n${text}`);
});

test("الرقم الضريبي يبقى بترتيبه", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("310122393500003"), "الرقم الضريبي انعكس أو تجزّأ");
});

// ── رمز QR ───────────────────────────────────────────────────────────────
test("رمز QR المرسوم يقرؤه قارئٌ مستقلّ ويطابق مجاميع الفاتورة", skip, async () => {
  const { buffer, qrPayload, totals } = await render();
  assert.ok(qrPayload, "لم يُبنَ رمز رغم أن البائع سعودي");

  const read = qrFromDrawnRectangles(buffer);
  assert.ok(read, "تعذّر إعادة بناء الرمز من المستطيلات المرسومة");
  assert.equal(read.data, qrPayload, "ما رُسم على الصفحة يخالف ما بُني");

  const fields = decodeZatcaQr(read.data);
  const byTag = Object.fromEntries(fields.map((f) => [f.tag, f.value]));
  assert.equal(byTag[1], INVOICE.seller.name);
  assert.equal(byTag[2], INVOICE.seller.vatNumber);
  assert.equal(byTag[3], INVOICE.issuedAt);
  assert.equal(byTag[4], "1546.75");
  assert.equal(byTag[5], "201.75");
  assert.equal(Number(byTag[4]) * 100, totals.total);
  assert.equal(Number(byTag[5]) * 100, totals.vatTotal);
});

test("الرمز يحمل المبلغ بلا فاصلة آلاف — الفاصلة للطباعة لا للترميز", skip, async () => {
  const big = {
    ...INVOICE,
    lines: [{ description: "دفعة", quantity: 1, unitPrice: 1000000, vatRate: 15 }],
  };
  const { qrPayload } = await render(big);
  const byTag = Object.fromEntries(decodeZatcaQr(qrPayload).map((f) => [f.tag, f.value]));
  assert.equal(byTag[4], "11500.00");
  assert.ok(!byTag[4].includes(","), "الفاصلة تسرّبت إلى الرمز");
});

test("بائع غير سعودي: لا يُوضع رمز بمواصفة الهيئة", skip, async () => {
  const egyptian = { ...INVOICE, currency: "EGP", seller: { name: "شركة النيل" } };
  const { qrPayload, buffer } = await render(egyptian);
  assert.equal(qrPayload, null, "وُضع رمز امتثال على فاتورة خارج نطاقه");
  assert.ok(showsArabic(buffer, "شركة النيل"), "اسم البائع لم يُطبع");
});

// ── التفقيط ──────────────────────────────────────────────────────────────
test("المبلغ بالحروف يُطبع حين يُمرَّر محرّك تفقيط", skip, async () => {
  const { buffer } = await render(INVOICE, {
    amountInWords: (minor, currency) => `${minor / 100} ${currency} بالحروف`,
  });
  assert.ok(showsArabic(buffer, "فقط"), "سطر التفقيط لم يُطبع");
});

test("وبغيابه لا يُخترع نصّ", skip, async () => {
  assert.ok(!showsArabic((await render()).buffer, "لا غير"), "طُبع سطر تفقيط بلا محرّك");
});

// ── سلامة الملف ──────────────────────────────────────────────────────────
test("الناتج ملف PDF صالح بصفحة واحدة", skip, async () => {
  const { buffer } = await render();
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  const loaded = await PDFDocument.load(buffer);
  assert.equal(loaded.getPageCount(), 1);
  const [w, h] = [loaded.getPage(0).getWidth(), loaded.getPage(0).getHeight()];
  assert.ok(Math.abs(w - 595.28) < 1 && Math.abs(h - 841.89) < 1, "ليست A4");
});

test("الفاتورة الضريبية (B2B) تطبع بيانات المشتري", skip, async () => {
  const b2b = {
    ...INVOICE, kind: "standard",
    buyer: { name: "شركة المستقبل", vatNumber: "300999888700003" },
  };
  const text = textInPdf((await render(b2b)).buffer);
  assert.ok(text.includes("300999888700003"), "الرقم الضريبي للمشتري لم يُطبع");
});

// ── ما كشفته العينُ ولم تكشفه المحاجّة ──────────────────────────────────
//
// الاختبارات أعلاه كانت خضراء كلها، والفاتورة المطبوعة تحمل «(15% )150.00»
// و«(15)%» و«SAR 1,571.75». عيوبٌ لا يراها إلا من نظر إلى الصفحة — فصارت
// هذه اختباراتِ انحدارٍ حتى لا تعود.

test("خلية الضريبة تُطبع «المبلغ (النسبة)» لا مفكّكة", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("150.00 (15%)"),
    `خلية الضريبة تفكّكت — ما طُبع:\n${text.split("\n").filter((l) => l.includes("15")).join("\n")}`);
  assert.ok(!text.includes("(15% )150.00"), "الأقواس تفرّقت على جانبَي الرقم");
});

test("سطر الضريبة في المجاميع يحمل نسبته داخل قوسيها", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("(15%)"), "النسبة خرجت من قوسيها");
  assert.ok(!text.includes("(15)%"), "علامة النسبة تسرّبت خارج القوس");
});

test("المبلغ يسبق عملته لا العكس", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("1,546.75 SAR"), `العملة سبقت المبلغ:\n${text}`);
  assert.ok(!text.includes("SAR 1,546.75"), "العملة سبقت المبلغ");
});

test("التاريخ والوقت يبقيان معاً وبترتيبهما", skip, async () => {
  const text = textInPdf((await render()).buffer);
  assert.ok(text.includes("2026/09/01 13:45:00"), `التاريخ والوقت تفرّقا:\n${text}`);
});

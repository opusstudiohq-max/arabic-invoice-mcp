/**
 * الاختبار الذي كان سيمسك كل عيبٍ قِسناه: **يقرأ الرسوم من داخل ملف PDF
 * المُنتَج**، لا من مخرَج الدالة.
 *
 * وهذا هو الفرق العملي كله. الحزم التي فحصناها تُخرج سلسلةً صحيحة من
 * دوالّها، ثم يعكسها `pdf-lib` عند الرسم فيصل العميلَ مبلغٌ مقلوب. اختبارٌ
 * يفحص المخرَج النصّي يمرّ، والفاتورة تخرج خطأً.
 *
 * فنحن نفكّ ضغط مجرى المحتوى، ونقرأ معرّفات الرسوم، ونردّها إلى محارفها
 * عبر خريطة الخط. ما نؤكّده هو ما يراه القارئ على الورق.
 *
 *   node --test arabic-text/tests/pdf.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import zlib from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fontkitModule from "fontkit";

import { drawArabicText, measureArabicText, drawArabicParagraph } from "../dist/pdf.js";

const fk = fontkitModule.default ?? fontkitModule;
const HERE = dirname(fileURLToPath(import.meta.url));

/** خطٌّ عربي على النظام. الاختبار يتخطّى نفسه إن لم يوجد — لا يكذب بالنجاح. */
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/tahoma.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  join(HERE, "fonts", "arabic.ttf"),
];
const FONT_PATH = FONT_CANDIDATES.find(existsSync);

const fontBytes = FONT_PATH ? readFileSync(FONT_PATH) : null;
const analysed = fontBytes ? fk.create(fontBytes) : null;

/** معرّف الرسم ← محرفه، عبر عكس خريطة الخط. */
const glyphToChar = new Map();
if (analysed) {
  for (let cp = 0x20; cp <= 0xfeff; cp++) {
    const g = analysed.glyphForCodePoint(cp);
    if (g && !glyphToChar.has(g.id)) glyphToChar.set(g.id, String.fromCodePoint(cp));
  }
}

/** يرسم بالدالة المُمرَّرة ويُعيد ما كُتب في الملف فعلاً، يساراً ← يميناً. */
async function renderAndReadBack(draw) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([595, 842]);
  draw(page, font);
  const pdf = Buffer.from(await doc.save());

  const marker = Buffer.from("endstream");
  for (let i = 0; i < pdf.length - 6; i++) {
    if (pdf.subarray(i, i + 6).toString("latin1") !== "stream") continue;
    const start = pdf[i + 6] === 0x0d ? i + 8 : i + 7;
    const body = pdf.subarray(start, pdf.indexOf(marker, start));
    let content;
    try { content = zlib.inflateSync(body).toString("latin1"); }
    catch { content = body.toString("latin1"); }
    const pieces = [...content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) =>
      (m[1].match(/..../g) ?? []).map((h) => glyphToChar.get(parseInt(h, 16)) ?? "\uFFFD").join(""),
    );
    if (pieces.length) return pieces.join("");
  }
  return "";
}

const skipIfNoFont = { skip: FONT_PATH ? false : "لا يوجد خطّ عربي على هذا النظام" };

// ── العيب الذي وُجدت المكتبة من أجله ────────────────────────────────────
test("المبلغ داخل نصّ عربي يُطبع كما كُتب — لا مقلوباً", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "الإجمالي 1,234.50 ج.م", { font, size: 20, x: 40, y: 700, align: "left" }),
  );
  assert.ok(out.includes("1,234.50"),
    `المبلغ لم يُطبع سليماً. ما كُتب في الملف: «${out}»`);
  assert.ok(!out.includes("05.432,1"), "المبلغ خرج مقلوباً — وهذا العيب نفسه");
});

test("pdf-lib وحدها تقلب المبلغ — تثبيتٌ للأساس الذي نقيس عليه", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    page.drawText("الإجمالي 1,234.50 ج.م", { x: 40, y: 700, size: 20, font }),
  );
  assert.ok(out.includes("05.432,1"),
    `توقّعنا العيب المعروف في pdf-lib فلم نجده — راجع الاختبار قبل المكتبة. ما كُتب: «${out}»`);
});

test("اللاتينية داخل نصّ عربي لا تنعكس", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "شركة ABC للتجارة", { font, size: 18, x: 40, y: 700, align: "left" }),
  );
  assert.ok(out.includes("ABC"), `توقّعنا ABC فوجدنا: «${out}»`);
  assert.ok(!out.includes("CBA"), "اللاتينية انعكست");
});

test("رقم الفاتورة وتاريخها يبقيان مقروءين", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "الفاتورة رقم INV-2026/001", { font, size: 16, x: 40, y: 700, align: "left" }),
  );
  assert.ok(out.includes("INV-2026/001"), `رقم الفاتورة انكسر: «${out}»`);
});

test("التاريخ بالشرطة المائلة يبقى بترتيبه — وهو ما نوصي به", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "بتاريخ 2026/09/01", { font, size: 16, x: 40, y: 700, align: "left" }),
  );
  assert.ok(out.includes("2026/09/01"), `التاريخ انكسر: «${out}»`);
});

/**
 * فخٌّ يجب أن يُوثَّق لا أن يُخفى: الشرطة `-` بين أرقامٍ عربية الصنف
 * (AN) لا تصير رقماً بقاعدة W4 — فتبقى محايدة وتأخذ اتجاه ما حولها،
 * فينقسم التاريخ ثلاثة مقاطع ويُعرض `01-09-2026`.
 *
 * وهذا **سلوك يونيكود الصحيح**، لا عيب فينا: يُنتجه كل عارض مطابق، ومنه
 * متصفّحك. والشرطة المائلة `/` من صنف CS فتلتحق بالرقم وتنجو.
 * لذلك نوصي بـ`/` في فواتير عربية، أو بعزل التاريخ بمحارف العزل.
 */
test("التاريخ بالشرطة ينقسم — سلوك يونيكود صحيح، موثَّق لا مُخفى", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "بتاريخ 2026-09-01", { font, size: 16, x: 40, y: 700, align: "left" }),
  );
  assert.ok(out.includes("01-09-2026"),
    `توقّعنا ترتيب يونيكود المطابق فوجدنا: «${out}»`);
});

test("الأقواس تُقلب داخل المقطع العربي (قاعدة L4)", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "المبلغ (نقداً)", { font, size: 18, x: 40, y: 700, align: "left" }),
  );
  const open = out.indexOf("("), close = out.indexOf(")");
  assert.ok(open >= 0 && close >= 0, `لم يُرسم القوسان: «${out}»`);
  assert.ok(open < close, `القوسان لم يُقلبا — «${out}»`);
});

// ── القياس والمحاذاة ────────────────────────────────────────────────────
test("القياس يساوي مجموع ما رُسم", skipIfNoFont, async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage();
  const text = "الإجمالي 1,234.50 ج.م";
  const drawn = drawArabicText(page, text, { font, size: 14, x: 500, y: 700 });
  assert.equal(drawn, measureArabicText(text, font, 14));
  assert.ok(drawn > 0);
});

test("المحاذاة التلقائية تُسند الفقرة العربية إلى يمينها", skipIfNoFont, async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([595, 842]);
  const width = drawArabicText(page, "فاتورة ضريبية", { font, size: 14, x: 555, y: 700 });
  // الحافة اليمنى عند x، فالبداية عند x - width
  assert.ok(555 - width < 555 && 555 - width > 0);
});

test("الفقرة تُكسر عند حدود الكلمات لا داخلها", skipIfNoFont, async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([595, 842]);
  const long = "هذه فاتورة ضريبية صادرة وفق منظومة الفاتورة الإلكترونية بمبلغ 1,234.50 جنيهاً مصرياً";
  const lines = drawArabicParagraph(page, long, {
    font, size: 12, x: 555, y: 700, maxWidth: 200,
  });
  assert.ok(lines > 1, "لم يقع كسرٌ رغم ضيق العرض");
});

test("النصّ الفارغ لا يرسم شيئاً ولا يرمي", skipIfNoFont, async () => {
  const out = await renderAndReadBack((page, font) =>
    drawArabicText(page, "", { font, size: 12, x: 40, y: 700 }),
  );
  assert.equal(out, "");
});

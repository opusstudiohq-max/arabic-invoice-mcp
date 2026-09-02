/**
 * اختبارات تكافؤ (parity) مع المرجع Python: zatca_qr.py
 * =====================================================
 * العينات المشفّرة أدناه مولّدة فعلياً بكود المشروع المرجعي
 * (arabic_invoice_mcp.zatca_qr.encode_zatca_qr) — أي انحراف = فشل تكافؤ.
 * الاختبار يستهدف الكود المشحون فعلياً للمتصفح: js/zatca-validator.js
 *
 * تشغيل: node zatca-checker/tests/validator.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V = require("../js/zatca-validator.js");

// مولّدة من: encode_zatca_qr('مؤسسة أوبس التجارية','310122393500003','2026-07-06T14:30:00Z','1150.00','150.00')
const VALID_QR =
  "ASTZhdik2LPYs9ipINij2YjYqNizINin2YTYqtis2KfYsdmK2KkCDzMxMDEyMjM5MzUwMDAwMwMUMjAyNi0wNy0wNlQxNDozMDowMFoEBzExNTAuMDAFBjE1MC4wMA==";
// رقم ضريبي يبدأ بـ 1 (TLV خام يتجاوز تحقق المولد)
const BAD_VAT_QR =
  "AQlUZXN0IFNob3ACDzExMDEyMjM5MzUwMDAwMwMUMjAyNi0wNy0wNlQxNDozMDowMFoEBjExNS4wMAUFMTUuMDA=";
// تاريخ بلا T ولا timezone
const BAD_TS_QR =
  "AQlUZXN0IFNob3ACDzMxMDEyMjM5MzUwMDAwMwMQMjAyNi0wNy0wNiAxNDozMAQGMTE1LjAwBQUxNS4wMA==";
// Tag 5 مفقود
const MISSING_TAG5_QR =
  "AQlUZXN0IFNob3ACDzMxMDEyMjM5MzUwMDAwMwMUMjAyNi0wNy0wNlQxNDozMDowMFoEBjExNS4wMA==";

function tagCheck(result, tag) {
  return (result.checks || []).find((c) => c.tag === tag || c.tag === String(tag));
}

test("QR صالح (مولّد من كود Python المرجعي) → متوافق 5/5", () => {
  const r = V.validateZatcaQR(VALID_QR);
  assert.equal(r.fatalError, null);
  assert.equal(r.valid, true, JSON.stringify(r.checks));
  assert.equal(r.score, 5);
});

test("القيم المفكوكة من QR الصالح تطابق المُدخلات الأصلية", () => {
  const r = V.validateZatcaQR(VALID_QR);
  const vals = Object.values(r.decoded || {});
  assert.ok(vals.includes("مؤسسة أوبس التجارية"), "اسم البائع");
  assert.ok(vals.includes("310122393500003"), "الرقم الضريبي");
  assert.ok(vals.includes("2026-07-06T14:30:00Z"), "التاريخ");
  assert.ok(vals.includes("1150.00"), "الإجمالي");
  assert.ok(vals.includes("150.00"), "الضريبة");
});

test("رقم ضريبي لا يبدأ بـ 3 → فشل Tag 2 (مطابق zatca_qr.py:76)", () => {
  const r = V.validateZatcaQR(BAD_VAT_QR);
  assert.equal(r.valid, false);
  const c = tagCheck(r, 2);
  assert.ok(c, "لا يوجد فحص لـ Tag 2");
  assert.equal(c.passed, false);
});

test("تاريخ بلا ISO/timezone → فشل Tag 3 (مطابق zatca_qr.py:78)", () => {
  const r = V.validateZatcaQR(BAD_TS_QR);
  assert.equal(r.valid, false);
  const c = tagCheck(r, 3);
  assert.ok(c, "لا يوجد فحص لـ Tag 3");
  assert.equal(c.passed, false);
});

test("Tag 5 مفقود → غير متوافق وفشل Tag 5", () => {
  const r = V.validateZatcaQR(MISSING_TAG5_QR);
  assert.equal(r.valid, false);
  const c = tagCheck(r, 5);
  assert.ok(c, "لا يوجد فحص لـ Tag 5");
  assert.equal(c.passed, false);
});

test("نص ليس Base64 → خطأ قاطع (fatalError)", () => {
  const r = V.validateZatcaQR("هذا ليس base64 !!!");
  assert.ok(r.fatalError, "يجب رفض غير الـ Base64");
});

test("نص فارغ → خطأ قاطع", () => {
  const r = V.validateZatcaQR("   ");
  assert.ok(r.fatalError);
});

// ===== تكافؤ regex التاريخ مع _ISO8601_STRICT في zatca_qr.py =====

test("صيغ تاريخ مقبولة: Z و +03:00 وكسور ثوانٍ", () => {
  for (const good of [
    "2026-07-04T15:30:00Z",
    "2026-07-04T15:30:00+03:00",
    "2026-07-04T15:30:00.123Z",
  ]) {
    assert.ok(V.ISO8601_STRICT.test(good), `رُفض خطأً: ${good}`);
  }
});

test("صيغ تاريخ مرفوضة: بلا timezone / بلا وقت / نص حر", () => {
  for (const bad of ["2026-07-04T15:30:00", "2026-07-04", "July 4 2026", "2026/07/04T15:30:00Z"]) {
    assert.ok(!V.ISO8601_STRICT.test(bad), `قُبل خطأً: ${bad}`);
  }
});

// ===== تكافؤ قواعد الحقول المنفردة (نفس حالات test_zatca_qr.py) =====

// الدوال المنفردة تستقبل tagData = { value, byteLength } كما في parseTLV
const td = (value) => ({ value, byteLength: new TextEncoder().encode(value ?? "").length });

test("الرقم الضريبي: 15 رقماً يبدأ بـ3 يمر؛ قصير/طويل/حروف/يبدأ بغير 3 يفشل", () => {
  assert.equal(V.validateVATNumber(td("300123456700003")).passed, true);
  for (const bad of ["30012345670000", "3001234567000031", "30012345670000a", "100123456700003", ""]) {
    assert.equal(V.validateVATNumber(td(bad)).passed, false, `قُبل خطأً: "${bad}"`);
  }
});

test("اسم البائع: فارغ ومسافات يفشلان؛ واسمٌ عربي طويل يمرّ", () => {
  assert.equal(V.validateSellerName(td("مؤسسة أوبس")).passed, true);
  for (const bad of ["", "   "]) {
    assert.equal(V.validateSellerName(td(bad)).passed, false, `قُبل خطأً: "${bad}"`);
  }
  // كان هنا: «200 حرف = 400 بايت ⇒ يُرفض، الحدّ 255». وذلك خطأ مضاعف —
  // الحدّ الحاكم سقفُ الرمز كلّه (700 حرف Base64) لا حدٌّ للحقل، وترميز BER
  // يحمل حتى 65,535 بايتاً. فاسمُ منشأةٍ من 200 حرف **صحيحٌ بنيوياً**.
  assert.equal(V.validateSellerName(td("ش".repeat(200))).passed, true);
});

/**
 * **الاختبار الذي كشف أن الأداة تكذب على مستعملها.**
 *
 * قارئ الطول ببايتٍ واحد يقرأ `0x81` طولاً قدره 129 فيبتلع الوسم التالي،
 * ثم يُعلن «بيانات مقطوعة» — أي يُخبر تاجراً سعودياً اسمُه من 64 حرفاً
 * عربياً أن رمزه **الصحيح** مكسور. والحدّ ليس مصطنعاً: الحرف العربي بايتان.
 *
 * https://zatca1.discourse.group/t/qr-code-rejected-when-tag-1-company-name-exceeds-127-characters/7202
 */
test("الطول بقواعد BER — الأداة تقرأ ما يقبله مُحقِّق الهيئة", () => {
  const enc = new TextEncoder();
  /** مشفّر BER مستقل، مكتوب هنا ولا يستدعي كود الأداة. */
  const berTlv = (tag, value) => {
    const v = enc.encode(value);
    const len = v.length < 0x80 ? [v.length]
      : v.length <= 0xFF ? [0x81, v.length]
      : [0x82, v.length >> 8, v.length & 0xFF];
    return [tag, ...len, ...v];
  };
  const qr = (name) => {
    const bytes = [
      ...berTlv(1, name),
      ...berTlv(2, "310122393500003"),
      ...berTlv(3, "2026-07-06T14:30:00Z"),
      ...berTlv(4, "1150.00"),
      ...berTlv(5, "150.00"),
    ];
    return Buffer.from(bytes).toString("base64");
  };

  for (const count of [63, 64, 127, 128, 200]) {
    const name = "ش".repeat(count);
    const r = V.validateZatcaQR(qr(name));
    assert.equal(r.fatalError, null, `${count} حرفاً: خطأ قاتل`);
    assert.ok(Object.values(r.decoded || {}).includes(name),
      `اسمٌ من ${count} حرفاً (${count * 2} بايتاً) لم يُقرأ كما كُتب`);
    assert.equal(r.valid, true, `${count} حرفاً: حُكم عليه بالمخالفة وهو صحيح`);
  }
});

test("التاريخ: صيغة صحيحة تمر؛ بلا timezone يفشل (مطابق _ISO8601_STRICT)", () => {
  assert.equal(V.validateTimestamp(td("2026-07-04T15:30:00Z")).passed, true);
  assert.equal(V.validateTimestamp(td("2026-07-04T15:30:00")).passed, false);
});

/**
 * **الأداة كانت تُبارك أشهر عيبٍ في الميدان.**
 *
 * قِيس على المُشفّرات المعطوبة الأربعة التي رصدها مقياسنا: رمزٌ بطولٍ
 * `0x80` عند 128 بايتاً — وهو خمسٌ من إحدى عشرة حزمة قِيست — كان يُصنَّف
 * **«5/5 سليم»**. أي أن تاجراً رُفض رمزُه عند الهيئة يلصقه هنا فيُطمأن.
 *
 * و`0x80` في موضع الطول ليس «128» في BER بل **الطول غير المحدَّد**، ولا
 * يجوز هنا. فقراءتُه 128 تُخفي العيب.
 *
 * وهذه الحالات تفحص أن كل شكلِ عطبٍ **يُرفض ويُسمّى**، لا أن يُرفض فحسب:
 * فرسالة «تأكد أن البيانات هي محتوى QR» صحيحةٌ وعديمة النفع.
 */
const enc = new TextEncoder();
const buildQr = (lenFn, chars) => {
  const tlv = (t, v) => { const b = enc.encode(v); return [t, ...lenFn(b), ...b]; };
  const bytes = [
    ...tlv(1, "ش".repeat(chars)), ...tlv(2, "310122393500003"),
    ...tlv(3, "2026-07-06T14:30:00Z"), ...tlv(4, "1150.00"), ...tlv(5, "150.00"),
  ];
  return Buffer.from(bytes).toString("base64");
};
const berLen = (b) => b.length < 0x80 ? [b.length]
  : b.length <= 0xFF ? [0x81, b.length] : [0x82, b.length >> 8, b.length & 0xFF];

test("رمزٌ سليم بترميز BER يمرّ 5/5 مهما طال الاسم", () => {
  for (const chars of [10, 63, 64, 127, 128, 200]) {
    const r = V.validateZatcaQR(buildQr(berLen, chars));
    assert.equal(r.fatalError, null, `${chars} حرفاً: خطأ قاتل`);
    assert.equal(r.valid, true, `${chars} حرفاً: حُكم عليه بالمخالفة وهو سليم`);
  }
});

test("طولٌ 0x80 يُرفض ويُسمّى — أشهر سبب لرفض الرمز", () => {
  const r = V.validateZatcaQR(buildQr((b) => [b.length & 0xFF], 64));
  assert.equal(r.valid, false, "بُورك عيبٌ يرفضه مُحقِّق الهيئة");
  const said = r.fatalError || (r.structuralErrors || [])[0] || "";
  assert.match(said, /0x80/, "العيب لم يُسمَّ ببايته");
  assert.match(said, /0x81/, "لم يُذكر الصواب");
});

test("طولٌ صفر (بترٌ فوق 255) يُرفض ويُسمّى", () => {
  const r = V.validateZatcaQR(buildQr((b) => [b.length & 0xFF], 128));
  assert.equal(r.valid, false);
  const said = r.fatalError || (r.structuralErrors || [])[0] || "";
  assert.match(said, /صفر/, "لم يُذكر أن الطول المعلن صفر");
  assert.match(said, /0x82/, "لم يُذكر الصواب");
});

test("محرف الاستبدال مكان الطول يُرفض ويُسمّى", () => {
  const r = V.validateZatcaQR(buildQr((b) => b.length < 0x80 ? [b.length] : [0xEF, 0xBF, 0xBD], 64));
  assert.equal(r.valid, false);
  const said = r.fatalError || (r.structuralErrors || [])[0] || "";
  assert.match(said, /U\+FFFD|EF BF BD/, "لم يُسمَّ محرف الاستبدال");
});

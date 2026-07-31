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

test("اسم البائع: فارغ/مسافات/أطول من 255 بايت يفشل؛ اسم عربي يمر", () => {
  assert.equal(V.validateSellerName(td("مؤسسة أوبس")).passed, true);
  for (const bad of ["", "   "]) {
    assert.equal(V.validateSellerName(td(bad)).passed, false, `قُبل خطأً: "${bad}"`);
  }
  // 200 حرف عربي = 400 بايت UTF-8 > 255 (مطابق zatca_qr.py:_tlv)
  assert.equal(V.validateSellerName(td("ش".repeat(200))).passed, false);
});

test("التاريخ: صيغة صحيحة تمر؛ بلا timezone يفشل (مطابق _ISO8601_STRICT)", () => {
  assert.equal(V.validateTimestamp(td("2026-07-04T15:30:00Z")).passed, true);
  assert.equal(V.validateTimestamp(td("2026-07-04T15:30:00")).passed, false);
});

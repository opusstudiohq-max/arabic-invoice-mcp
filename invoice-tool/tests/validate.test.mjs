/**
 * اختبار فحص البائع — الحالات التي قبلتها الأداة بصمت قبل الإصلاح.
 *
 *   node --test invoice-tool/tests/validate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSeller } from "../src/validate.js";

const GOOD_VAT = "310122393500003";

test("بائع سليم: اسم ورقم ضريبي صحيح", () => {
  assert.deepEqual(validateSeller({ name: "شركة اختبار", vatNumber: GOOD_VAT }), []);
});

test("اسم البائع فارغ يُرفض", () => {
  assert.equal(validateSeller({ name: "", vatNumber: GOOD_VAT }).length, 1);
});

test("اسم من مسافات فقط يُرفض", () => {
  assert.equal(validateSeller({ name: "   ", vatNumber: GOOD_VAT }).length, 1);
});

test("العلامة الاحتياطية «—» لا تُقبل اسماً", () => {
  assert.equal(validateSeller({ name: "—", vatNumber: GOOD_VAT }).length, 1);
});

test("رقم ضريبي من 14 خانة يُرفض", () => {
  assert.equal(validateSeller({ name: "شركة", vatNumber: "31012239350000" }).length, 1);
});

test("رقم ضريبي من 15 خانة فيه حروف يُرفض", () => {
  assert.equal(validateSeller({ name: "شركة", vatNumber: "31012239350abcd" }).length, 1);
});

test("رقم ضريبي لا يبدأ بـ3 يُرفض", () => {
  assert.equal(validateSeller({ name: "شركة", vatNumber: "110122393500003" }).length, 1);
});

test("أرقام هندية عربية تُرفض", () => {
  assert.equal(validateSeller({ name: "شركة", vatNumber: "٣١٠١٢٢٣٩٣٥٠٠٠٠٣" }).length, 1);
});

test("الرقم الضريبي الفارغ يبقى مقبولاً (فاتورة بلا QR، كما كان)", () => {
  assert.deepEqual(validateSeller({ name: "شركة", vatNumber: "" }), []);
});

test("اسم فارغ ورقم خاطئ معاً: مشكلتان", () => {
  assert.equal(validateSeller({ name: "", vatNumber: "123" }).length, 2);
});

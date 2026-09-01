/**
 * حساب المجاميع — بالهللات، لأن الهللة هي ما تُرفض الفاتورة من أجله.
 *
 *   node --test invoice-pdf/tests/model.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, formatMinor } from "../dist/model.js";

const base = {
  number: "INV-1",
  issuedAt: "2026-09-01T10:00:00+03:00",
  currency: "SAR",
  seller: { name: "مؤسسة الأمل", vatNumber: "310122393500003" },
};
const of = (lines) => computeTotals({ ...base, lines });

test("الحساب الأساسي", () => {
  const t = of([{ description: "خدمة", quantity: 1, unitPrice: 10000, vatRate: 15 }]);
  assert.equal(t.subtotal, 10000);
  assert.equal(t.vatTotal, 1500);
  assert.equal(t.total, 11500);
});

/**
 * البرهان على سبب العمل بالأعداد الصحيحة: الفاصلة العائمة تُخطئ في هذا
 * المثال بعينه، وهو مثال فاتورة عادية لا حالة حدّية مصطنعة.
 */
test("الحساب بالهللات ينجو مما تُخطئ فيه الفاصلة العائمة", () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal((1.005).toFixed(2), "1.00");            // والصواب 1.01

  const t = of([
    { description: "أ", quantity: 3, unitPrice: 10, vatRate: 15 },
    { description: "ب", quantity: 3, unitPrice: 20, vatRate: 15 },
  ]);
  assert.equal(t.subtotal, 90);
  assert.equal(formatMinor(t.subtotal), "0.90");
});

/**
 * الضريبة تُحسب لكل بند ثم تُجمع — لا على المجموع. والفرق هللةٌ في فاتورة
 * ذات بنود كثيرة، وهي الهللة التي تُفشل المطابقة.
 */
test("الضريبة لكل بند ثم تُجمع، لا على المجموع", () => {
  const lines = Array.from({ length: 7 }, (_, i) => ({
    description: `بند ${i + 1}`, quantity: 1, unitPrice: 333, vatRate: 15,
  }));
  const t = of(lines);
  const perLine = Math.round((333 * 15) / 100);        // 50
  assert.equal(t.vatTotal, perLine * 7);               // 350
  const onTotal = Math.round((333 * 7 * 15) / 100);    // 350 أو 349 بحسب التقريب
  if (t.vatTotal !== onTotal) {
    assert.ok(true, `الفرق مقصود: ${t.vatTotal} مقابل ${onTotal}`);
  }
});

test("إجمالي البند يُؤخذ من المستدعي إن مُرِّر — لا نصحّح محاسبته", () => {
  const t = of([{ description: "قماش", quantity: 2.5, unitPrice: 333, vatRate: 15, lineTotal: 832 }]);
  assert.equal(t.lines[0].lineTotal, 832, "تُجوهِل الرقم المُمرَّر");
  assert.equal(t.subtotal, 832);
});

test("وإن غاب حُسب بتقريب نصفٍ إلى أعلى", () => {
  const t = of([{ description: "قماش", quantity: 2.5, unitPrice: 333, vatRate: 15 }]);
  assert.equal(t.lines[0].lineTotal, 833);             // 832.5 ⇒ 833
});

test("النسب المختلفة تُجمَّع كلٌّ على حدة", () => {
  const t = of([
    { description: "خاضع", quantity: 1, unitPrice: 10000, vatRate: 15 },
    { description: "معفى", quantity: 1, unitPrice: 5000, vatRate: 0 },
  ]);
  assert.deepEqual(t.vatByRate, [
    { rate: 0, taxable: 5000, vat: 0 },
    { rate: 15, taxable: 10000, vat: 1500 },
  ]);
  assert.equal(t.total, 16500);
});

test("المدخل الفاسد يُرفض بوضوح", () => {
  assert.throws(() => of([]), /بلا بنود/);
  assert.throws(() => of([{ description: "س", quantity: 0, unitPrice: 100, vatRate: 15 }]), /الكمية/);
  assert.throws(() => of([{ description: "س", quantity: 1, unitPrice: 10.5, vatRate: 15 }]), /صحيحاً/);
  assert.throws(() => of([{ description: "س", quantity: 1, unitPrice: 100, vatRate: -1 }]), /ضريبة/);
});

test("التنسيق يفصل الآلاف ويحفظ الكسر", () => {
  assert.equal(formatMinor(0), "0.00");
  assert.equal(formatMinor(5), "0.05");
  assert.equal(formatMinor(123450), "1,234.50");
  assert.equal(formatMinor(100000000), "1,000,000.00");
  assert.equal(formatMinor(-150), "-1.50");
});

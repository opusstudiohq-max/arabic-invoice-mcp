/**
 * اختبار تقسيم المقاطع — الطبقة التي فيها كل قيمتنا.
 *
 * الخوارزمية نفسها ليست لنا، وقد أثبتت مطابقتها في `conformance.test.mjs`.
 * أمّا هنا فنختبر **التركيب**: أن يخرج من التقسيم مقاطعُ يصحّ تشكيلُ كلٍّ
 * منها وحده، وأن يُعاد بناء النصّ منها بلا زيادة ولا نقصان.
 *
 *   node --test arabic-text/tests/runs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRuns, paragraphDirection, mirror } from "../dist/index.js";

/** ما تخرج به الدالة، منسوقاً للقراءة. */
const shape = (text, base) => resolveRuns(text, base).map((r) => `${r.rtl ? "◀" : "▶"}${r.text}`);

test("المبلغ يخرج مقطعاً يسارياً مستقلاً — وهذا كل الفرق", () => {
  const runs = resolveRuns("الإجمالي 1,234.50 ج.م", "rtl");
  const money = runs.find((r) => r.text.includes("1,234"));
  assert.ok(money, "لم يُعزل المبلغ في مقطع");
  assert.equal(money.rtl, false, "المبلغ في مقطع يميني — سيُعكس عند الرسم");
  assert.equal(money.text, "1,234.50", "المبلغ تجزّأ أو التقط ما ليس منه");
});

test("اللاتينية تخرج مقطعاً يسارياً", () => {
  const runs = resolveRuns("شركة ABC للتجارة", "rtl");
  const latin = runs.find((r) => r.text.includes("ABC"));
  assert.ok(latin && latin.rtl === false);
  assert.equal(latin.text, "ABC");
});

test("النصّ العربي الخالص مقطع واحد يميني", () => {
  const runs = resolveRuns("فاتورة ضريبية مبسطة", "rtl");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].rtl, true);
});

test("النصّ اللاتيني الخالص مقطع واحد يساري بلا قلب", () => {
  const runs = resolveRuns("Tax Invoice (original)", "ltr");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].rtl, false);
  assert.equal(runs[0].text, "Tax Invoice (original)");
});

test("المقاطع تُعيد بناء النصّ كاملاً — لا حرف يضيع ولا يتكرر", () => {
  for (const text of [
    "الإجمالي 1,234.50 ج.م",
    "شركة ABC للتجارة",
    "الفاتورة رقم INV-2026/001 بتاريخ 2026-09-01",
    "المبلغ (نقداً) والباقي 15 جنيهاً",
    "Total: 99.00 EGP — الإجمالي",
  ]) {
    const joined = resolveRuns(text, "rtl").map((r) => r.text).join("");
    assert.equal(joined.length, text.length, `طول مختلف في «${text}»`);
    // المقارنة بمجموعة المحارف: الترتيب بصريّ عمداً، والأقواس تُقلب
    const norm = (s) => [...s].map((c) => mirror(c)).sort().join("");
    assert.equal(norm(joined), norm(text), `محارف مختلفة في «${text}»`);
  }
});

test("الأقواس تُقلب في المقطع اليميني وحده", () => {
  const rtl = resolveRuns("المبلغ (نقداً)", "rtl");
  assert.ok(rtl.some((r) => r.rtl && r.text.includes(")")),
    "لم يُقلب القوس داخل المقطع العربي");

  const ltr = resolveRuns("Amount (cash)", "ltr");
  assert.equal(ltr[0].text, "Amount (cash)", "قُلب قوسٌ في مقطع يساري — خطأ");
});

test("mirror يقلب المتناظر ويترك غيره", () => {
  assert.equal(mirror("(نقداً)"), ")نقداً(");
  assert.equal(mirror("فاتورة"), "فاتورة");
  assert.equal(mirror("[س]"), "]س[");
});

test("اتجاه الفقرة يُستنبط من أول محرف قويّ — لا نخمّنه", () => {
  assert.equal(paragraphDirection("فاتورة Invoice"), "rtl");
  assert.equal(paragraphDirection("Invoice فاتورة"), "ltr");
  assert.equal(paragraphDirection("1234 فاتورة"), "rtl", "الرقم ليس محرفاً قوياً");
  assert.equal(paragraphDirection("فاتورة", "ltr"), "ltr", "التصريح يغلب الاستنباط");
});

test("النصّ الفارغ لا مقاطع له", () => {
  assert.deepEqual(resolveRuns(""), []);
});

test("النصّ بلا اتجاه قويّ لا يرمي", () => {
  for (const t of ["123", "   ", "!!!", "1,234.50"]) {
    assert.ok(Array.isArray(resolveRuns(t)), `رمى على «${t}»`);
  }
});

/**
 * الفخّ الذي أوقع حزمتين منشورتين: من رتّب النصّ بصرياً ثم سلّمه إلى
 * مكتبة تعكس بنفسها، وقع العكس مرّتين. مقاطعُنا تخرج بترتيبها **المنطقي**
 * عمداً، لتتولّى أداةُ التشكيل عكسها مرّةً واحدة.
 */
test("المقطع اليميني يخرج بترتيبه المنطقي لا البصري", () => {
  const [run] = resolveRuns("فاتورة", "rtl");
  assert.equal(run.text, "فاتورة", "خرج معكوساً — سينعكس مرّتين عند الرسم");
});

test("التاريخ بالشرطة ينقسم والمائل لا ينقسم — فرقٌ في يونيكود لا فينا", () => {
  const dash = resolveRuns("بتاريخ 2026-09-01", "rtl").filter((r) => !r.rtl);
  const slash = resolveRuns("بتاريخ 2026/09/01", "rtl").filter((r) => !r.rtl);
  assert.ok(dash.length > 1, "الشرطة ES بين رقمين عربيَّي الصنف لا تلتحق بهما (W4/W6)");
  assert.equal(slash.length, 1, "الشرطة المائلة CS تلتحق بالرقم فينجو التاريخ");
  assert.equal(slash[0].text, "2026/09/01");
});

test("النصّ المختلط باللغتين يعطي مقاطع متناوبة", () => {
  const runs = shape("Total الإجمالي 100 EGP", "ltr");
  assert.ok(runs.length >= 3, `توقّعنا تناوباً فوجدنا ${JSON.stringify(runs)}`);
});

/**
 * حارسٌ على README الحزمة نفسه.
 *
 * انجرف رقمٌ منشور عندنا مرّتين من قبل — «٥٠ حالة» وهي ٥٢، و«١٦٠ اختباراً»
 * وهي ١٧٦ — وكلاهما كان صحيحاً يوم كُتب. فالرقم المكتوب بيدٍ في وثيقة
 * عامة ادعاءٌ يجب أن يحرسه اختبار، لا مراجعةُ عينٍ.
 */
test("عدد الاختبارات في README يطابق الواقع", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));

  const readme = readFileSync(join(here, "..", "README.md"), "utf-8");
  const arabicDigits = (s) => Number([...s].map((c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).join(""));

  const claimed = [...readme.matchAll(/([٠-٩]{1,4})\s*اختبار/g)].map((m) => arabicDigits(m[1]));
  assert.ok(claimed.length > 0, "README لا يذكر عدد اختبارات — أزل الحارس أو أعد الرقم");

  const files = ["runs.test.mjs", "pdf.test.mjs"];          // ما يشغّله npm test
  const actual = files.reduce((sum, f) => {
    const src = readFileSync(join(here, f), "utf-8");
    return sum + (src.match(/^test\(/gm) ?? []).length;
  }, 0);

  for (const n of claimed) {
    assert.equal(n, actual,
      `README يعلن ${n} اختباراً و«npm test» يشغّل ${actual} — أحدهما انجرف`);
  }
});

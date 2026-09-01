/**
 * حارس الانحراف: النسخة المُودَعة في المقياس تطابق مصدر الحقيقة.
 *
 * المقياس يحمل نسخة من محرّك التفقيط (`engine.js`) ليكون قائماً بذاته
 * وقابلاً لإعادة التشغيل من أي مستودع. والنسخ يُنتج انحرافاً صامتاً: يُصحَّح
 * المصدر ويبقى المقياس على القديم، فيقيس شيئاً لا نشحنه.
 *
 * هذا بالضبط صنف العيب الذي كلّفنا اكتشافاً متأخراً: البناء المشحون كان 38%
 * بينما المصدر 100%.
 *
 * التشغيل:  node tafgeet-benchmark/tests/no-drift.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// مصدر الحقيقة موجود في مستودع العمل فقط؛ وفي المستودع العام يُتخطّى الفحص
// بوضوح بدل أن يفشل — حارسٌ يفشل حيث لا يُفترض أن يعمل يُعلَّم كضجيج فيُهمَل.
const SOURCE = join(ROOT, "cheque-tool", "js", "tafgeet.js");
const VENDORED = join(HERE, "..", "engine.js");

/** نُسقط لافتة الإيداع وفروق نهايات الأسطر — لا شيء غيرهما. */
function body(text) {
  return text
    .replace(/^\/\*\*[\s\S]*?نسخة مُودَعة[\s\S]*?\*\/\s*/, "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

test("النسخة المُودَعة تطابق مصدر الحقيقة حرفاً بحرف", (t) => {
  if (!existsSync(SOURCE)) return t.skip("مصدر الحقيقة غير موجود في هذا التخطيط");
  const src = body(readFileSync(SOURCE, "utf-8"));
  const ven = body(readFileSync(VENDORED, "utf-8"));

  if (src !== ven) {
    // نُظهر أول اختلاف بدل إغراق المخرَج
    const a = src.split("\n"), b = ven.split("\n");
    const i = a.findIndex((line, idx) => line !== b[idx]);
    assert.fail(
      `انحراف عند السطر ${i + 1}:\n` +
      `  المصدر  : ${a[i] ?? "(غائب)"}\n` +
      `  المُودَعة: ${b[i] ?? "(غائب)"}\n\n` +
      `أعد النسخ:  cp cheque-tool/js/tafgeet.js tafgeet-benchmark/engine.js\n` +
      `ثم أعد إضافة لافتة الإيداع في رأس الملف.`
    );
  }
});

test("النسختان تعطيان المخرَج نفسه على حالات المقياس", async (t) => {
  if (!existsSync(SOURCE)) return t.skip("مصدر الحقيقة غير موجود في هذا التخطيط");
  const [srcMod, venMod] = await Promise.all([
    import(new URL("../../cheque-tool/js/tafgeet.js", import.meta.url).href),
    import(new URL("../engine.js", import.meta.url).href),
  ]);
  const data = JSON.parse(readFileSync(join(HERE, "..", "cases.json"), "utf-8"));
  const cases = [
    ...data.cases.map(c => ({ ...c, currency: c.currency || data.currency })),
    ...data.extra_currency_cases,
  ];
  const diffs = cases.filter(c =>
    srcMod.tafgeet(c.amount, c.currency) !== venMod.tafgeet(c.amount, c.currency));
  assert.deepEqual(diffs, [], `${diffs.length} اختلاف سلوكي بين المصدر والنسخة`);
});

test("المقياس يفحص بناءنا المشحون، لا محرّكنا الداخلي وحده", () => {
  // نسبةً لملف الاختبار — اسم المجلد يختلف بين مستودع العمل والعام
  const run = readFileSync(join(HERE, "..", "run.mjs"), "utf-8");
  assert.match(run, /mutawafiq-ts/, "البناء المشحون ليس ضمن المحرّكات المفحوصة");
  assert.match(run, /const OURS = \[[^\]]*mutawafiq-ts/,
    "الحارس لا يشمل البناء المشحون — وهو الذي رسب أول مرة");
});

/**
 * بوابة الإصدار: لا نصدر ونحن نرسب في مقياسنا.
 *
 * المشغّل نفسه أداة عامة يتسامح مع غياب dist، أمّا هنا — في مستودع العمل —
 * فالتخطّي عيبٌ في بيئتنا: يعني أننا لم نبنِ الحزمة قبل القياس، فنشرنا
 * نتيجةً لا تشمل ما نشحنه.
 */
test("بوابة إصدار: كل محرّك نملكه فُحص واجتاز", (t) => {
  // بوابة مستودع العمل وحده. في المستودع العام يُعاد تشغيل المقياس بمحرّكات
  // أقل (لا dist ولا ذاكرة جلب)، فنتيجته المحلية أضعف عمداً ولا تعني رسوباً.
  if (!existsSync(SOURCE)) return t.skip("ليست بيئة الإصدار");
  const resultsPath = join(HERE, "..", "results.json");
  if (!existsSync(resultsPath)) return t.skip("لم يُشغَّل المقياس بعد");
  const { engines } = JSON.parse(readFileSync(resultsPath, "utf-8"));

  for (const id of ["mutawafiq", "mutawafiq-ts"]) {
    const e = engines.find(x => x.id === id);
    assert.ok(e, `المحرّك ${id} غائب عن النتائج`);
    assert.ok(!e.skipped,
      `${e.name} تُخطّي (${e.skipped}) — ابنِ الحزمة ثم أعد التشغيل قبل النشر`);
    assert.equal(e.fail, 0,
      `${e.name} أخفق في ${e.fail} حالة — لا يُنشر مقياس ونحن نرسب فيه`);
  }
});

/**
 * حارس ثالث: **لا عدد حالات مكتوب بيد** في نصّ يراه القارئ.
 *
 * وقع فعلاً: نُشرت الصفحة بـ«50 حالة» ثم صارت 52، فبقي النص القديم.
 * وهذا انحراف من صنف انحراف البناء المشحون — ادعاءٌ صحيح يوم كُتب، كاذب بعده.
 * العدد يُقرأ من `results.json` وقت العرض، ولا يُكتب في نصّ ثابت.
 *
 * الاستثناء الوحيد المسموح: السجلّ التاريخي («19/50 في 31 أغسطس») لأنه
 * قياسٌ مؤرَّخ لا ادعاءٌ حالي — ويُميَّز بذكر تاريخه بجواره.
 */
test("لا عدد حالات مكتوب بيد خارج السجلّ التاريخي", () => {
  const { cases_total } = JSON.parse(readFileSync(join(HERE, "..", "results.json"), "utf-8"));
  const surfaces = ["index.html", "README.md"];

  for (const name of surfaces) {
    const path = join(HERE, "..", name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf-8");

    for (const m of text.matchAll(/(\d{2,4})\s*حالة(\s*\S+)?/g)) {
      const n = Number(m[1]);
      if (n === cases_total) continue;                    // مطابق للواقع
      // «حالة تكافؤ» ادعاء عن حزمة أخرى (بايثون مقابل المتصفح) لا عن المقياس
      if ((m[2] || "").includes("تكافؤ")) continue;
      const around = text.slice(Math.max(0, m.index - 200), m.index + 60);
      const dated = /\d{1,2}\s*(أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر|يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو)|يومها|حينها/.test(around);
      assert.ok(dated,
        `${name}: العدد «${n} حالة» لا يطابق results.json (${cases_total}) ` +
        `ولا يحمل تاريخاً يجعله سجلاً. اقرأ العدد من النتائج أو أرفقه بتاريخه.`);
    }
  }
});

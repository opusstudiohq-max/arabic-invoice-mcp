/**
 * حرّاس مقياس النصّ في PDF.
 *
 * الصفحة **مولَّدة** من `results.json`، فلا رقم فيها مكتوبٌ بيد. وهذه
 * الاختبارات تفرض بقاء ذلك — لأن الانحراف وقع عندنا مرّتين: صفحةٌ تقول
 * «50 حالة» وهي 52، ووصفُ مستودعٍ يعلن عدداً قديماً بقي شهراً.
 *
 *   node --test pdf-benchmark/tests/no-drift.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const cases = JSON.parse(readFileSync(join(ROOT, "cases.json"), "utf-8"));
const results = existsSync(join(ROOT, "results.json"))
  ? JSON.parse(readFileSync(join(ROOT, "results.json"), "utf-8"))
  : null;
const page = existsSync(join(ROOT, "index.html"))
  ? readFileSync(join(ROOT, "index.html"), "utf-8")
  : null;

const built = { skip: results && page ? false : "لم يُشغَّل المقياس بعد" };

test("عدد الحالات في النتائج يطابق cases.json", built, () => {
  assert.equal(results.cases_total, cases.cases.length);
});

test("لا عدد حالات مكتوب بيد في الصفحة يخالف الواقع", built, () => {
  // يلتقط الفواصل الألفية: كان النمط `\d{1,3}` يقرأ «91,707» فيأخذ «707»
  // وحده، فيُبلّغ عن انحرافٍ لا وجود له. وقاعدةٌ تُفشل صواباً تُكسب الخطأ
  // ثقتها — وهو الدرس نفسه للمرة الثالثة.
  const claimed = [...page.matchAll(/([\d,]+)\s*حالة/g)]
    .map((m) => Number(m[1].replace(/,/g, "")));
  const CONFORMANCE_SUITE = 91707;      // حالات يونيكود، لا حالاتنا
  const wrong = claimed.filter((n) => n !== cases.cases.length && n !== CONFORMANCE_SUITE);
  assert.deepEqual(wrong, [],
    `الصفحة تعلن ${wrong} حالة والواقع ${cases.cases.length}`);
});

test("كل حالة تحمل قاعدةً معرَّفة — فالحكم ليس رأينا", built, () => {
  const defined = new Set(Object.keys(cases.rules));
  const orphans = cases.cases.filter((c) => !defined.has(c.rule)).map((c) => c.id);
  assert.deepEqual(orphans, [], `حالات بلا قاعدة معرَّفة: ${orphans}`);
});

test("كل حالة تحمل ما يجب أن يظهر", () => {
  const missing = cases.cases.filter((c) => !c.must_show).map((c) => c.id);
  assert.deepEqual(missing, []);
});

/**
 * ما لا يقيسه المشغّل قياساً تامّاً **لا يُمنح عليه درجة**.
 *
 * كانت حالة قلب الأقواس تمرّ لمجرّد ظهور قوسٍ ما — درجةٌ بلا معنى، تُجمّل
 * نتيجة كل محرّك بالتساوي. فنُقلت إلى `documented_behaviour`.
 */
test("لا حالة مسجَّلة تتكرر في السلوك الموثَّق", () => {
  const scored = new Set(cases.cases.map((c) => c.id));
  const both = cases.documented_behaviour.filter((d) => scored.has(d.id)).map((d) => d.id);
  assert.deepEqual(both, [], `مسجَّلة وموثَّقة معاً: ${both}`);
});

test("بوابة إصدار: محرّكنا يجتاز كل حالة", built, () => {
  const ours = results.engines.find((e) => e.ours);
  assert.ok(ours, "محرّكنا ليس ضمن المقاييس — ومن ينشر مقياساً يبدأ بنفسه");
  assert.equal(ours.fail, 0, `محرّكنا أخفق في ${ours.fail} حالة`);
  assert.equal(ours.total, cases.cases.length);
});

test("الصفحة تحمل صورة البرهان لا نصّاً مكسوراً", built, () => {
  assert.ok(page.includes("evidence.png"),
    "الصفحة بلا صورة برهان — والنصّ المكسور يُصلحه المتصفّح بصرياً فتضيع البرهنة");
  assert.ok(existsSync(join(ROOT, "evidence.png")), "الصورة نفسها غير مبنيّة");
});

test("النتائج تذكر الخطوط المستعملة", built, () => {
  assert.ok(Array.isArray(results.fonts) && results.fonts.length,
    "نتيجةٌ بلا ذكر الخطّ لا تُعاد — ونصف الخطوط تُنتج مكسوراً");
});

/**
 * حالةٌ جرت بخطٍّ لا يغطّي محارفها ترسم مربّعاتٍ وتقيس ما تبقّى، ثم تُعرض
 * نجاحاً. فكل حالة مسجَّلة يجب أن تحمل اسم الخطّ الذي غطّاها.
 */
test("كل حالة مسجَّلة تحمل الخطّ الذي غطّى محارفها", built, () => {
  for (const engine of results.engines.filter((e) => !e.skipped)) {
    const nameless = engine.rows.filter((r) => !r.skipped && !r.font).map((r) => r.id);
    assert.deepEqual(nameless, [], `${engine.id}: حالات بلا خطّ مسجَّل: ${nameless}`);
  }
});

test("الحالات المتخطّاة لا تُحسب نجاحاً", built, () => {
  for (const engine of results.engines.filter((e) => !e.skipped)) {
    const scored = engine.rows.filter((r) => !r.skipped).length;
    assert.equal(engine.total, scored, `${engine.id}: المقام يشمل حالاتٍ متخطّاة`);
  }
});

/**
 * الـREADME الإنجليزي يحمل النتائج **مكتوبةً بيد** — وهو صنف الانحراف
 * نفسه الذي وقع مرّتين. فتُقارن كل نتيجة فيه بما في `results.json`.
 */
test("نتائج README تطابق التشغيل الفعلي", built, () => {
  const readme = existsSync(join(ROOT, "README.md"))
    ? readFileSync(join(ROOT, "README.md"), "utf-8")
    : null;
  if (!readme) return;

  const byId = Object.fromEntries(
    results.engines.filter((e) => !e.skipped).map((e) => [e.id, e]));
  const claims = [
    ["pdf-lib", /`pdf-lib` as-is \| \*\*(\d+)\/(\d+)\*\*/],
    ["naqqash", /`naqqash`[^|]*\| \*\*(\d+)\/(\d+)\*\*/],
    ["bidi-shaper", /`bidi-shaper`[^|]*\| \*\*(\d+)\/(\d+)\*\*/],
    ["nasq", /`nasq`\*\* \(ours\) \| \*\*(\d+)\/(\d+)\*\*/],
  ];
  for (const [id, pattern] of claims) {
    const engine = byId[id];
    if (!engine) continue;                    // لم يُقَس في هذا التشغيل
    const match = readme.match(pattern);
    assert.ok(match, `README لا يذكر نتيجة ${id} بصيغة يمكن فحصها`);
    assert.equal(Number(match[1]), engine.pass, `${id}: README يعلن ${match[1]} والواقع ${engine.pass}`);
    assert.equal(Number(match[2]), engine.total, `${id}: المقام ${match[2]} والواقع ${engine.total}`);
  }
});

test("عدد الكتابات المذكور في README مقيسٌ فعلاً", built, () => {
  const readme = existsSync(join(ROOT, "README.md"))
    ? readFileSync(join(ROOT, "README.md"), "utf-8")
    : null;
  if (!readme) return;
  // كل كتابة يذكرها الجدول يجب أن تقابلها حالة مقيسة أو سلوك موثَّق
  const measured = new Set(cases.cases.map((c) => c.id));
  for (const [script, id] of [["Hebrew", "hebrew-money"], ["Persian", "persian-money"],
                              ["Urdu", "urdu-money"]]) {
    if (readme.includes(`| ${script} |`)) {
      assert.ok(measured.has(id), `README يذكر ${script} بلا حالة مقيسة (${id})`);
    }
  }
});

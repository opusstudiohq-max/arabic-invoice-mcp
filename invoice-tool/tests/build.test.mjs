/**
 * حرّاس أداة الفاتورة — أهمّ سطحٍ منشور، وكان **بلا اختبارٍ واحد**.
 *
 * ### الفجوة التي تسدّها
 *
 * مكتبة `fatura-zatca` مغطّاة بأربعين اختباراً. لكن **الأداة ليست المكتبة**: بينهما
 * بناءٌ يدمج، وخطٌّ يُنسخ، وصفحةٌ تُقلع في متصفّح. وكلُّ ذلك كان بلا حارس.
 *
 * ودرسُ اليوم مدفوعٌ مرّتين: الحزمة المنشورة `python-lib` بقيت على عيبٍ
 * أُصلح في مصدرها، لأن لا شيء يفحص **المشحون**. فهذه الاختبارات تفحص
 * `dist/` — ما يصل المستعمل — لا `src/`.
 *
 *   node --test invoice-tool/tests/
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..");
const DIST = join(TOOL, "dist");

let bundle = "";
let source = "";

before(() => {
  execFileSync("node", [join(TOOL, "build.mjs")], { encoding: "utf-8" });
  bundle = readFileSync(join(DIST, "app.js"), "utf-8");
  source = readFileSync(join(TOOL, "src", "app.js"), "utf-8");
});

test("① البناء يُخرج كل ما تحتاجه الصفحة", () => {
  for (const f of ["index.html", "style.css", "app.js", ".nojekyll",
                   "fonts/Almarai.ttf", "fonts/OFL.txt"]) {
    assert.ok(existsSync(join(DIST, f)), `ناقصٌ من المخرَج: ${f}`);
  }
  // رخصة OFL تشترط مرافقتها الخطَّ — وشحنُ الخطّ بلا رخصته مخالفة
  assert.ok(statSync(join(DIST, "fonts", "OFL.txt")).size > 1000,
    "ملف الرخصة أصغر من أن يكون الرخصة");
});

test("② الحزمة مدموجةٌ تماماً — لا استيرادٌ يموت عند المستعمل", () => {
  assert.doesNotMatch(bundle, /from\s*["']\.\.?\//, "بقي استيراد نسبي غير مدموج");
  assert.doesNotMatch(bundle, /^\s*import\s+.*from\s+["'][a-z@]/m, "بقي استيراد حزمة");
});

test("③ لا تغادر بيانات المستعمل جهازه", () => {
  // **الوعد أن لا تغادر البيانات، لا أن لا يوجد HTTP.**
  //
  // كُتب هذا الحارس أول مرة يمنع `fetch` مطلقاً، فأخفق على استدعاءٍ صحيح:
  // الأداة تجلب ملف الخطّ من أصل الصفحة نفسها — طلبٌ بلا جسم، لأصلٍ واحد،
  // ولا يحمل حرفاً من الفاتورة. ومنعُه كان يمنع الأداةَ من العمل.
  //
  // فالقاعدة تُدقَّق لا تُضعَّف: يُمنع ما **يُخرج بياناتٍ** — عنوانٌ مطلق،
  // أو طلبٌ بجسم، أو منارةٌ إحصائية.

  assert.doesNotMatch(bundle, /\bsendBeacon\s*\(/, "منارة إحصائية — تُرسل بلا علم المستعمل");
  assert.doesNotMatch(bundle, /new\s+XMLHttpRequest/, "طلب XHR في حزمةٍ تَعِد بالمحلية");
  assert.doesNotMatch(bundle, /new\s+WebSocket/, "قناة مفتوحة إلى خادم");

  const absolute = [...bundle.matchAll(/fetch\s*\(\s*["'`]?https?:\/\/[^"'`)]+/g)].map((m) => m[0]);
  assert.deepEqual(absolute, [], `جلبٌ من أصلٍ خارجي: ${absolute.join("، ")}`);

  const withBody = [...bundle.matchAll(/fetch\s*\([^)]{0,200}?\bbody\s*:/g)].map((m) => m[0].slice(0, 60));
  assert.deepEqual(withBody, [], `طلبٌ يحمل جسماً — أي بياناتٍ تخرج: ${withBody.join("، ")}`);

  // وما بقي يجب أن يكون أصلاً واحداً: الخطّ. فزيادةٌ عليه تستحق قراءة.
  const fetches = [...bundle.matchAll(/fetch\s*\(/g)].length;
  assert.equal(fetches, 1,
    `عدد استدعاءات fetch ${fetches} — المتوقَّع واحدٌ فقط (ملف الخطّ). راجع الزيادة.`);
});

/**
 * **الحارس الذي يثبت أن الإصلاح وصل المشحون.**
 *
 * ترميز الطول بقواعد BER أُصلح في `fatura-zatca`. لكنّ الأداة تُجمَّع من نسخةٍ
 * مبنيّة، فقد يُصلَح المصدر ويبقى المشحون على عيبه — وذاك ما وقع فعلاً في
 * حزمةٍ أخرى عندنا. فيُفحص **التوقيع في الحزمة نفسها**، مصغَّراً كما هو.
 */
test("④ الحزمة المشحونة تحمل ترميز الطول بقواعد BER", () => {
  const has81 = /\[\s*129\s*,/.test(bundle) || /0x81/.test(bundle);
  const has82 = /\[\s*130\s*,/.test(bundle) || /0x82/.test(bundle);
  assert.ok(has81, "لا أثر لشكل الطول 0x81 في الحزمة — الإصلاح لم يصل المشحون");
  assert.ok(has82, "لا أثر لشكل الطول 0x82 في الحزمة");
});

test("⑤ الفاتورة سعودية بالبناء: ريال، والنوع يتبع وجود المشتري", () => {
  assert.match(source, /currency:\s*["']SAR["']/,
    "العملة ليست مثبَّتة على الريال — والسوق المُقرَّر السعودية");

  // المبسّطة للمستهلك، والقياسية حين يُذكر المشتري. وهذا تمييزٌ نظامي لا تجميلي.
  assert.match(source, /kind:.*buyerName.*standard.*simplified/s,
    "قاعدة نوع الفاتورة تغيّرت — تحقّق أنها ما زالت تتبع وجود المشتري");
});

test("⑥ نسبة الضريبة المبدئية 15% — وهي نسبة المملكة", () => {
  assert.match(source, /values\.vatRate\s*\?\?\s*15/,
    "النسبة المبدئية تغيّرت — 15% هي النسبة السارية في السعودية");
  // الخيار يُبنى في `src/app.js` لا في الصفحة — والاختبار الأول بحث في
  // الصفحة فأخفق على محتوىً صحيح. الحارس يتبع الكود لا الظنّ.
  assert.match(source, /<option value="15">15%<\/option>/,
    "خيار 15% غائب عن صفّ البنود");
});

test("⑦ الصفحة المنشورة فيها سبيلُ تواصل — نصّاً لا رابطاً فقط", () => {
  const page = readFileSync(join(DIST, "index.html"), "utf-8");
  assert.match(page, /href="mailto:[^"]+"/, "لا رابط mailto");
  assert.match(page, />\s*[^<\s]+@[^<\s]+\.[a-z]{2,}\s*</i,
    "العنوان غير ظاهرٍ نصّاً — من يستعمل بريده عبر المتصفح يبقى بلا سبيل");
});

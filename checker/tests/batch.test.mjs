/**
 * حرّاس صفحة الفحص الجماعي — سطحٌ منشور كان **بلا اختبارٍ واحد**.
 *
 * ### لماذا
 *
 * `/checker/batch.html` موجّهة إلى مكاتب المحاسبة، وهي أعلى شريحةٍ قيمةً في
 * نموذج العمل: المحاسب يفحص محفظة عملائه دفعةً واحدة ويُصدر تقريراً باسمه.
 * ومع ذلك لم يكن لها حرفُ اختبار، بينما لأختها `index.html` ثلاثة عشر.
 *
 * وشُغّلت يدوياً في متصفّح على ست حالات فعملت — لكن التشغيل اليدوي يزول
 * بزوال الجلسة، والانحدار بعده يمرّ صامتاً.
 *
 * ### مبدأ التصميم الذي تحرسه
 *
 * الصفحة **لا تحمل منطق تحقّقٍ خاصاً بها** — تستدعي `window.ZatcaValidator`
 * المُختبَر. فأي منطقِ تحقّقٍ يُكتب فيها ازدواجٌ يتفرّق عن أصله بصمت،
 * ويجعل المحفظة تُحكَم بقاعدةٍ غير قاعدة الفحص المفرد.
 *
 *   node --test zatca-checker/tests/batch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const batch = readFileSync(join(HERE, "..", "js", "batch.js"), "utf-8");
const report = readFileSync(join(HERE, "..", "js", "report.js"), "utf-8");
const html = readFileSync(join(HERE, "..", "batch.html"), "utf-8");

/**
 * `parseLines` دالّةٌ نقيّة، فتُستخرج وتُشغَّل **فعلاً** لا تُفحص نصّاً.
 * والفحص النصّي آخر ما يُلجأ إليه، لا أوّله.
 */
function extractParseLines() {
  const start = batch.indexOf("function parseLines");
  const end = batch.indexOf("function run(");
  assert.ok(start > -1 && end > start, "تعذّر استخراج parseLines — تغيّرت بنية الملف");
  const src = batch.slice(start, end);
  return new Function(`${src}; return parseLines;`)();
}

test("① سطرٌ بصيغة «اسم | رمز» يُفصل، وسطرٌ بلا فاصل يأخذ اسماً تلقائياً", () => {
  const parseLines = extractParseLines();

  const parsed = parseLines("مؤسسة الأمل | ABC123\nXYZ789\n   \n  اسمٌ بمسافات  |  QR  ");
  assert.equal(parsed.length, 3, "الأسطر الفارغة يجب أن تُسقط");

  assert.deepEqual(parsed[0], { name: "مؤسسة الأمل", qr: "ABC123" });
  assert.deepEqual(parsed[1], { name: "فاتورة 2", qr: "XYZ789" },
    "سطرٌ بلا فاصل يجب أن يُعطى اسماً تلقائياً بترتيبه");
  assert.deepEqual(parsed[2], { name: "اسمٌ بمسافات", qr: "QR" },
    "المسافات على الحواف تُقصّ من الاسم والرمز");
});

test("② اسمٌ فارغ قبل الفاصل يعود إلى الاسم التلقائي لا إلى فراغ", () => {
  const parseLines = extractParseLines();
  const parsed = parseLines("| ABC");
  assert.equal(parsed[0].name, "فاتورة 1", "صفٌّ بلا اسم يظهر بلا عنوان في التقرير");
  assert.equal(parsed[0].qr, "ABC");
});

test("③ الصفحة لا تحمل منطق تحقّقٍ خاصاً بها", () => {
  assert.ok(batch.includes("window.ZatcaValidator"),
    "الصفحة لا تستدعي المحرّك المُختبَر");

  // قواعدُ تحقّقٍ مكتوبةٌ هنا = ازدواجٌ يتفرّق عن أصله بصمت
  for (const rule of [/\^\\d\{15\}\$/, /startsWith\(['"]3['"]\)/, /ISO8601/]) {
    assert.ok(!rule.test(batch),
      `قاعدة تحقّقٍ مكرّرة في batch.js — مكانها zatca-validator.js وحده: ${rule}`);
  }
});

test("④ التصنيف ثلاثيّ: اجتاز، ومخاطرة، وغير مقروء — ولكلٍّ عدّاده", () => {
  for (const bucket of ["compliant", "atRisk", "unreadable"]) {
    assert.ok(batch.includes(bucket), `عدّاد «${bucket}» غائب`);
  }
  assert.ok(/r\.fatalError/.test(batch), "لا تمييز للرمز غير المقروء عن المخالف");
  assert.ok(/r\.valid/.test(batch), "لا تمييز للمجتاز");
});

test("⑤ التقرير يذكر نطاقه ولا يدّعي قبول الهيئة", () => {
  assert.ok(/لا يؤكد هذا التقرير أن الهيئة قبلت/.test(report),
    "التقرير بلا تنبيهٍ صريح أنه لا يثبت القبول — وهو ادعاءٌ يُساء فهمه");
  assert.ok(/ليس شهادة امتثال|وليس شهادة امتثال/.test(report),
    "التقرير لا ينفي عن نفسه صفة شهادة الامتثال");

  // claims-lint: allow
  for (const banned of ["معتمد من الهيئة", "نضمن الامتثال", "قبل الغرامة"]) {
    assert.ok(!report.includes(banned), `التقرير يحمل ادعاءً محظوراً: «${banned}»`);
  }
});

test("⑥ بيانات المكتب تبقى في الجهاز — لا خادم", () => {
  assert.ok(/localStorage/.test(report), "الملف الشخصي لا يُحفظ محلياً");
  assert.ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon/.test(report + batch),
    "استدعاء شبكة في مسار المحفظة — يخالف وعد «لا تغادر بياناتك جهازك»");
});

test("⑦ الصفحة تُحمّل المحرّك قبل مستهلكيه", () => {
  const order = [...html.matchAll(/<script[^>]*src="js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(order.includes("zatca-validator.js"), "المحرّك غير محمَّل");
  assert.ok(order.indexOf("zatca-validator.js") < order.indexOf("batch.js"),
    "ترتيب السكربتات يجعل batch.js يقرأ محرّكاً غير موجود");
});

/**
 * **التشخيص بلا علاج نصفُ منتج.**
 *
 * المحرّك يُنتج `fix` لكل فحصٍ يُخفق، والفحص المفرد يعرضه. أمّا المحفظة
 * والتقرير فكانا يُسقطانه: فيتسلّم المحاسبُ ملاحظةً بلا إصلاح، ويسلّمها
 * لعميله كذلك — وهو التقرير الذي يبني به سمعته.
 */
test("⑧ إرشاد الإصلاح يصل المحفظة والتقرير لا الفحص المفرد وحده", () => {
  assert.match(batch, /firstFail\.fix/,
    "batch.js لا يلتقط إرشاد الإصلاح من المحرّك");
  assert.match(batch, /detailed\.push\(\{[^}]*\bfix\b/,
    "الإصلاح لا يُمرَّر إلى النتائج المُهيكلة التي يقرؤها التقرير");
  assert.match(batch, /detail-fix/, "الإصلاح لا يُعرض في جدول المحفظة");
  assert.match(report, /r\.fix/, "التقرير لا يعرض الإصلاح");
});

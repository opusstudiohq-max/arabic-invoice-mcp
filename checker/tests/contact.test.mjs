/**
 * حرّاس مسار التواصل — آخرُ خطوةٍ في القمع، وأسهلُ ما يسقط بصمت.
 *
 * ### لماذا هذه الاختبارات
 *
 * الأداة كلّها موجودة لسببٍ واحد: أن يصل من يحتاجنا إلينا. وكان في المسار
 * عيبان، لم يشتكِ منهما شيء:
 *
 * ① **بطاقة التواصل تظهر عند الإخفاق وحده.** فمن مرّ رمزُه 5/5 لم يجد
 *    سبيلاً أصلاً — ونصفُ الزوّار كذلك، وفيهم أكفأُ من يُحادَث.
 * ② **البريد داخل `href` لا نصّاً.** ومن يستعمل بريده عبر المتصفح — وهم
 *    الأكثر — ينقر فلا يحدث شيء، ولا يجد عنواناً ينسخه.
 *
 * ### ولماذا فحصٌ على المصدر
 *
 * `app.js` كودُ متصفّح يعتمد `document`، ولا يُستورد في Node بلا تزييفٍ
 * ثقيل يقيس المزيّف لا الأصل. والذي يجب أن يُحرَس هنا **بنيويّ**: ألّا
 * تعود البطاقة مشروطةً، وألّا يختفي العنوان من النصّ. وهذا يُقرأ من المصدر
 * قراءةً تامّة.
 *
 *   node zatca-checker/tests/contact.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(HERE, "..", "js", "app.js"), "utf-8");

/** البريد المعلن في الأداة — مصدرُ الحقيقة، فلا يُكرَّر هنا بيد. */
const EMAIL = /const CONTACT_EMAIL = '([^']+)'/.exec(app)?.[1];

test("① عنوان تواصلٍ معرَّفٌ وصالح الشكل", () => {
  assert.ok(EMAIL, "CONTACT_EMAIL غير معرَّف — لا سبيل للتواصل أصلاً");
  assert.match(EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, `عنوانٌ غير صالح: ${EMAIL}`);
});

test("② البطاقة تُعرض في الحالين لا عند الإخفاق وحده", () => {
  assert.match(app, /html \+= contactCard\(result\);/,
    "البطاقة لا تُضاف بلا شرط — من مرّ رمزُه لن يجد سبيلاً للتواصل");

  // الشرط القديم: `if (!result.valid) { … lead-card … }`
  const conditional = /if \(!result\.valid\)[\s\S]{0,400}lead-card/.test(app);
  assert.equal(conditional, false,
    "بطاقة التواصل عادت مشروطةً بإخفاق الفحص — وذاك يُسقط نصف الزوّار");
});

test("③ البطاقة تفرّق بين السليم والمُخفق ولا تخترع مشكلة", () => {
  const fn = app.slice(app.indexOf("function contactCard"), app.indexOf("function showFatalError"));
  assert.ok(fn.includes("const ok = result.valid"), "البطاقة لا تعرف حال النتيجة");
  assert.ok(/سليمة/.test(fn), "لا نصّ لمن رمزُه سليم");
  assert.ok(/لا حاجة لك بنا/.test(fn),
    "النصّ للسليم يجب ألّا يخترع له مشكلة — وهذا شرطٌ على النبرة لا على الشكل");
});

test("④ العنوان ظاهرٌ نصّاً لا داخل href وحده", () => {
  const inHref = new RegExp(`href="mailto:\\$\\{CONTACT_EMAIL\\}`).test(app);
  assert.ok(inHref, "رابط mailto مفقود");

  const asText = /<span class="contact-mail"[^>]*>\$\{CONTACT_EMAIL\}<\/span>/.test(app);
  assert.ok(asText,
    "العنوان غير معروضٍ نصّاً — من يستعمل بريده عبر المتصفح يبقى بلا سبيل");
});

test("⑤ زرّ النسخ له بديلٌ حين تُحجب الحافظة", () => {
  assert.ok(app.includes("navigator.clipboard.writeText"), "لا زرّ نسخ");
  assert.ok(/catch\s*\{[\s\S]{0,400}selectNodeContents/.test(app),
    "لا بديل عند حجب الحافظة — والحجبُ شائع في السياقات غير الآمنة");
});

test("⑥ لا وعدَ بما لا نملك في نصّ البطاقة", () => {
  const fn = app.slice(app.indexOf("function contactCard"), app.indexOf("function showFatalError"));
  // قائمةُ منعٍ لا ادعاء: هذه العبارات مكتوبةٌ هنا كي يُفشل الاختبارُ ظهورَها
  // في نصّ البطاقة. وبوابةُ الادعاءات أمسكت القائمة نفسها — محقّةً في القراءة
  // الحرفية، مخطئةً في المعنى. والإعفاء يُقبل على السطر أو في التعليق الذي
  // يسبقه مباشرةً، فيوضع هنا.
  // claims-lint: allow
  for (const banned of ["معتمد", "نضمن", "يضمن", "قبل الغرامة", "غرامة وشيكة"]) {
    assert.ok(!fn.includes(banned),
      `نصّ البطاقة يحمل ادعاءً محظوراً: «${banned}»`);
  }
});

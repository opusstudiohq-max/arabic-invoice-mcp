/**
 * اختبار نسخة الملف الواحد.
 *
 * الوعد البيعي هو «لا يحتاج تثبيت» — أي أن المشتري ينقر نقرتين على الملف
 * فيعمل. ووحدات ES **لا تعمل من `file://`**، فلو تسرّبت كلمة `import` واحدة
 * إلى المخرَج لرأى المشتري صفحة ميتة. هذه الاختبارات تمنع ذلك.
 *
 * التشغيل:  node cheque-tool/tests/build.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..");
const DIST = join(TOOL, "dist", "mutawafiq-cheque.html");

test("البناء يُنتج ملفاً واحداً", () => {
  execFileSync("node", [join(TOOL, "build.mjs")], { encoding: "utf-8" });
  assert.ok(existsSync(DIST), "ملف dist غير موجود بعد البناء");
});

const html = () => readFileSync(DIST, "utf-8");

test("لا أثر لوحدات ES في المخرَج — وإلا مات الملف على file://", () => {
  const h = html();
  assert.doesNotMatch(h, /type="module"/, 'بقي <script type="module">');
  assert.doesNotMatch(h, /^\s*import\s/m, "بقيت جملة import");
  assert.doesNotMatch(h, /^\s*export\s/m, "بقيت جملة export");
  assert.doesNotMatch(h, /from\s+['"]\.\//, "بقي مسار وحدة نسبي");
});

test("لا يطلب الملف أي مورد خارجي — يعمل بلا إنترنت", () => {
  const h = html();

  // **ما يُحمَّل عند الفتح يُمنع، وما ينتقل إليه المستعمل بنقرةٍ يُترك.**
  //
  // كان الفحص يمنع `href` أينما وقع، فأفشل إضافةَ رابط تواصلٍ ورابطِ مستودع
  // — وهما وجهةُ نقرٍ لا طلبَ شبكة، فلا يمسّان وعد «يعمل بلا إنترنت» ولا
  // وعد «لا تغادر بياناتك جهازك». والقاعدة تُدقَّق لا تُضعَّف: يُمنع `src`،
  // و`href` على `<link>` وحدها، و`@import`.
  const loaded = [
    ...h.matchAll(/\ssrc\s*=\s*["'](https?:)?\/\/[^"']+/g),
    ...h.matchAll(/<link\b[^>]*\shref\s*=\s*["'](https?:)?\/\/[^"']+/g),
    ...h.matchAll(/@import\s+(?:url\()?["']?(https?:)?\/\//g),
  ].map((m) => m[0].trim());
  assert.deepEqual(loaded, [], `موارد تُحمَّل عند الفتح: ${loaded.join(", ")}`);

  assert.doesNotMatch(h, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/,
    "استدعاء شبكة — يخالف وعد «لا تغادر بياناتك جهازك»");
});

/**
 * حارسٌ على المحارف الخفيّة في هذا الملف نفسه.
 *
 * أثناء تدقيق الفحص أعلاه تسرّب **بايت backspace** (0x08) إلى نمطٍ فصار
 * `<link` + بايتٍ غير مرئي + `[^>]*` — فلم يطابق شيئاً أبداً، **وبقي الفحص
 * أخضر وهو أعمى**. ومرّ على ثلاث قراءاتٍ بصرية لأن الطرفية لا ترسم البايت،
 * ولم يظهر إلا بـ`cat -A`.
 *
 * فالنمط الذي لا يطابق شيئاً لا يشتكي — يمرّ. وهذا الحارس يمنع تكرارها.
 */
test("لا محارف تحكّمٍ خفيّة في هذا الملف — نمطٌ أعمى يمرّ صامتاً", () => {
  const self = readFileSync(new URL(import.meta.url), "utf-8");
  const hidden = [...self.matchAll(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)]
    .map((m) => `0x${m[0].charCodeAt(0).toString(16).padStart(2, "0")} عند ${m.index}`);
  assert.deepEqual(hidden, [], `محارف تحكّم خفيّة: ${hidden.join("، ")}`);
});

test("السكربت المدمج صحيح نحوياً ويُنفَّذ", () => {
  const h = html();
  const m = h.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(m, "لم يُعثر على السكربت المدمج");
  const code = m[1];
  assert.doesNotThrow(() => new vm.Script(code), "خطأ نحوي في السكربت المدمج");
  assert.ok(code.length > 8000, `السكربت أقصر من المتوقع (${code.length} حرفاً) — قد يكون الدمج ناقصاً`);
});

/**
 * DOM وهمي أدنى — يبتلع كل ما يفعله التطبيق دون أن ينهار.
 * الغرض ليس محاكاة متصفح، بل إثبات أن **الملف المدمج يُقلع كاملاً** بلا
 * استثناء: كل `getElementById` يجد عنصره، وكل مستمع يُسجَّل، وأول `render`
 * يمرّ. لو انكسر الدمج (وحدة ناقصة، ترتيب خاطئ) لظهر هنا.
 */
function makeDomStub() {
  const el = () => new Proxy({
    style: {}, dataset: {}, classList: { add(){}, remove(){}, contains(){ return false; } },
    value: "", textContent: "", innerHTML: "", checked: false, files: [],
    children: [], tagName: "DIV",
    addEventListener(){}, append(){}, appendChild(){}, setPointerCapture(){},
    closest(){ return null; }, dispatchEvent(){ return true; },
    getBoundingClientRect(){ return { left:0, top:0, right:700, bottom:320, width:700, height:320 }; },
  }, {
    get(t, k) { return k in t ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });

  const doc = {
    getElementById: () => el(),
    createElement: () => el(),
    querySelectorAll: () => [],
    addEventListener(){},
    get activeElement(){ return { tagName: "BODY" }; },
    body: el(),
  };
  const store = new Map();
  return {
    document: doc,
    window: { addEventListener(){}, print(){} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    Option: function (text, value) { return { text, value }; },
    FileReader: function () { this.readAsDataURL = () => {}; this.readAsText = () => {}; },
    Blob: function () {}, URL: { createObjectURL: () => "", revokeObjectURL(){} },
    alert(){}, confirm(){ return false; }, setTimeout(){}, console,
  };
}

test("الملف المدمج يُقلع كاملاً، ومحرّكه يعطي النتائج الصحيحة", () => {
  const code = html().match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const ctx = makeDomStub();
  ctx.window.__probe = {};
  vm.createContext(ctx);

  // الإقلاع الكامل: لو انكسر الدمج فسيرمي هنا
  assert.doesNotThrow(
    () => new vm.Script(code).runInContext(ctx),
    "الملف المدمج لا يُقلع — الدمج معيب"
  );

  // ثم نستدعي المحرّك من داخل نفس النطاق الذي أقلع
  // البناء يغلّف كل شيء في نطاق مغلق (وهذا مقصود)، فنصل للمحرّك عبر
  // نقطة الوصول المعلنة window.__cheque
  const api = ctx.window.__cheque;
  assert.ok(api && typeof api.tafgeet === "function", "نقطة الوصول __cheque غير متاحة");
  const probe = {
    a: api.tafgeet(1250.75, "EGP"),
    b: api.tafgeet(2, "SAR"),
    c: api.tafgeet(150.75, "KWD"),
    d: api.chequeWords(103, "SAR"),
    e: api.tafgeet(2000, "EGP"),
  };

  assert.equal(probe.a, "ألف ومئتان وخمسون جنيهاً وخمسة وسبعون قرشاً");
  assert.equal(probe.b, "ريالان");
  assert.match(probe.c, /سبعمائة وخمسون فلساً/);
  assert.equal(probe.d, "فقط مائة وثلاثة ريالات لا غير");
  assert.equal(probe.e, "ألفا جنيه");
});

test("الوعود المكتوبة في الواجهة مطابقة للسلوك", () => {
  const h = html();
  // نَعِد بأن البيانات لا تغادر الجهاز — فيجب ألا يوجد أي إرسال
  assert.match(h, /لا تغادر بياناتك جهازك/);
  // ونَعِد بأن القوالب «نقاط بداية» لا مقاسات رسمية
  assert.match(h, /نقاط بداية/);
  // ولا يُحفظ محلياً إلا القوالب
  const stores = [...h.matchAll(/localStorage\.setItem\(([^,]+)/g)].map(m => m[1].trim());
  assert.deepEqual([...new Set(stores)], ["STORE_KEY"],
    "يُكتب في التخزين المحلي شيء غير القوالب");
});

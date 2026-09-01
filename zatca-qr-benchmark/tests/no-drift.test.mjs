/**
 * حرّاس مقياس رمز QR — يمنعون انجراف المقياس عن نفسه.
 *
 * **المقياس نفسه أداة، والأداة تنكسر بصمت.** فهذه الاختبارات تفحص أن
 * `results.json` المنشور يقابل `cases.json`، وأن محرّكاتنا مرّت فعلاً، وأن
 * الصفحة لا تحمل رقماً كُتب بيد.
 *
 *   node --test zatca-qr-benchmark/tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const read = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf-8"));

const cases = read("cases.json");
const results = read("results.json");
const page = readFileSync(join(ROOT, "index.html"), "utf-8");

const scored = results.engines.filter((e) => !e.skipped);
const ours = scored.filter((e) => e.ours);

test("① محرّكاتنا كلها مرّت — لا يُنشر مقياس والناشرُ ساقط", () => {
  assert.ok(ours.length >= 2, `عدد محرّكاتنا المسجّلة ${ours.length} — أين ذهب الباقي؟`);
  for (const engine of ours) {
    assert.equal(engine.fail, 0,
      `${engine.name} أخفق في ${engine.fail} حالة: ` +
      engine.rows.filter((r) => !r.ok).map((r) => `${r.id} (${r.why})`).join("، "));
  }
});

test("② البناء المشحون مقيسٌ لا متخطّى", () => {
  const shipped = results.engines.find((e) => e.id === "mcp-ts");
  assert.ok(shipped, "مدخل البناء المشحون غائب من السجلّ");
  assert.ok(!shipped.skipped, `تُخطّي البناء المشحون: ${shipped.skipped}`);
  assert.equal(shipped.pass, shipped.total);
});

test("③ كل حالة في cases.json مقيسةٌ لكل محرّك", () => {
  const ids = cases.cases.map((c) => c.id);
  assert.equal(results.cases_total, ids.length);
  for (const engine of scored) {
    assert.deepEqual(engine.rows.map((r) => r.id), ids,
      `${engine.name}: الحالات المسجّلة تخالف cases.json`);
  }
});

test("④ كل حالة تحمل قاعدةً معرّفة، وكل قاعدة مستعملة", () => {
  const defined = new Set(Object.keys(cases.rules));
  const used = new Set(cases.cases.map((c) => c.rule));
  for (const id of used) assert.ok(defined.has(id), `قاعدة «${id}» مستعملة وغير معرّفة`);
  for (const id of defined) {
    assert.ok(used.has(id), `قاعدة «${id}» معرّفة ولا حالة تختبرها — قاعدةٌ ميتة`);
  }
});

test("⑤ كل قاعدة تُسمّي مصدرها، وكل مصدر موجود", () => {
  for (const [id, rule] of Object.entries(cases.rules)) {
    assert.ok(rule.source, `قاعدة «${id}» بلا مصدر — الحَكَم يجب أن يكون مسمّى`);
    assert.ok(cases.sources[rule.source],
      `قاعدة «${id}» تُحيل إلى مصدر «${rule.source}» غير معرّف`);
  }
});

/**
 * الحالة التي وُجد عندها العيب: 64 حرفاً عربياً = 128 بايتاً.
 * فإن اختفت من المجموعة سقط سببُ وجود المقياس ولم يشتكِ أحد.
 */
test("⑥ حدّ الـ128 بايتاً مُختبَرٌ بحالةٍ قائمة", () => {
  const boundary = cases.cases.find((c) => c.expect?.tag1_length_form === "0x81");
  assert.ok(boundary, "لا حالة تفحص شكل الطول 0x81 — الحدّ الذي قام عليه المقياس");
  assert.equal(boundary.expect.tag1_declared_length, 128);

  const wide = cases.cases.find((c) => c.expect?.tag1_length_form === "0x82");
  assert.ok(wide, "لا حالة تفحص شكل الطول 0x82");
  assert.equal(wide.expect.tag1_declared_length, 256);
});

test("⑦ الحرف العربي بايتان — الأساس الذي يقوم عليه حدّ الـ64 حرفاً", () => {
  assert.equal(Buffer.byteLength("ش", "utf-8"), 2);
  assert.equal(Buffer.byteLength("ش".repeat(64), "utf-8"), 128);
  assert.equal(Buffer.byteLength("ش".repeat(63), "utf-8"), 126);
});

test("⑧ الصفحة مبنيّةٌ من النتائج الحالية لا من نسخةٍ قديمة", () => {
  assert.ok(page.includes(String(results.cases_total)),
    "عدد الحالات في الصفحة يخالف results.json");
  for (const engine of scored) {
    const label = engine.npm ?? engine.name;
    assert.ok(page.includes(label), `محرّك «${label}» غائب عن الصفحة`);
  }
});

test("⑨ لا رقم في الصفحة مكتوبٌ بيد — النسبة تُحسب من النتائج", () => {
  const withReach = scored.filter((e) => !e.ours && typeof e.monthly_downloads === "number");
  const total = withReach.reduce((n, e) => n + e.monthly_downloads, 0);
  const broken = withReach.filter((e) => e.fail > 0)
    .reduce((n, e) => n + e.monthly_downloads, 0);
  const share = (broken / total * 100).toFixed(1);
  assert.ok(page.includes(`${share}%`),
    `النسبة على الصفحة تخالف المحسوبة من النتائج (${share}%)`);
});

/**
 * **المقياس يقيس نفسه أولاً.**
 * لو صار كل محرّك يمرّ كل حالة، فالحالات لم تعد تفرّق — والمقياس مات وهو
 * أخضر. وهذا يفشل عمداً يوم يُصلح الجميع كودهم، وذاك يومٌ يستحق مراجعةً.
 */
test("⑩ الحالات ما زالت تفرّق بين المحرّكات", () => {
  const others = scored.filter((e) => !e.ours);
  const rates = new Set(others.map((e) => e.rate));
  assert.ok(rates.size > 1,
    "كل المحرّكات على درجةٍ واحدة — الحالات لم تعد تميّز، فراجع المجموعة");
  assert.ok(others.some((e) => e.fail > 0),
    "لا محرّك يُخفق — إمّا أُصلح الميدان كلّه (فراجع الحالات) أو انكسر المشغّل");
});

test("⑪ ما تُخطّي مذكورٌ بسببه ولا يُحسب إخفاقاً", () => {
  for (const engine of results.engines.filter((e) => e.skipped)) {
    assert.equal(typeof engine.skipped, "string");
    assert.ok(engine.skipped.length > 5, `سبب التخطّي عند ${engine.name} غير مفهوم`);
    assert.equal(engine.pass, undefined, "المتخطّى لا يُمنح درجة");
  }
});

test("⑫ التحويل على مدخل محرّكٍ ما مُعلَنٌ في الصفحة لا مخفيّ", () => {
  // تُنزع الوسوم قبل المقارنة: الباني يُدخل <bdi> داخل النصّ لعزل
  // الحرفيّات اتجاهياً، فالبحث عن النصّ خاماً يفشل على محتوىً سليم.
  const text = page.replace(/<[^>]+>/g, "");
  for (const engine of scored.filter((e) => e.adapter_note)) {
    const head = engine.adapter_note.slice(0, 12);
    assert.ok(text.includes(head),
      `تحويلُ مدخل ${engine.name} غير معروضٍ على الصفحة — قياسٌ بشرطٍ مخفيّ`);
  }
});

test("⑬ الحزم المقيسة مثبَّتةٌ في package.json فيُعاد التشغيل", () => {
  const pkg = read("package.json");
  const declared = new Set(Object.keys(pkg.devDependencies ?? {}));
  for (const engine of results.engines.filter((e) => e.npm)) {
    assert.ok(declared.has(engine.npm),
      `«${engine.npm}» مقيسةٌ وغير مثبّتة في package.json — لا يُعاد التشغيل عند غيرنا`);
  }
});

test("⑭ نسخة الحزم المقيسة مسجّلة — النتيجة تخصّ نسخةً بعينها", () => {
  const lock = join(ROOT, "package-lock.json");
  assert.ok(existsSync(lock), "لا ملف قفل — فالنتيجة غير قابلة لإعادة الإنتاج");
});

/**
 * **العيب الذي يُنشر ولا يُبلَّغ به صاحبه نميمةٌ مُحكمة.**
 *
 * فكل حزمةٍ سجّلت إخفاقاً على هذه الصفحة يجب أن يقابلها إمّا مسألةٌ مرفوعة
 * برابطٍ عام، أو سببٌ مذكور يمنع الرفع (مسائل معطَّلة، أو لا مستودع معلن).
 * وبلا هذا الحارس يسهل أن يُنشر الحكم ويُنسى الإبلاغ.
 */
test("⑮ كل حزمةٍ مُخفقة إمّا أُبلِغ أصحابُها أو ذُكر المانع", () => {
  const d = results.disclosures;
  assert.ok(d, "لا سجلّ إبلاغ — disclosures.json مفقود أو لم يُضمّ إلى النتائج");

  const covered = new Set([
    ...d.items.map((x) => x.npm),
    ...d.not_reported.map((x) => x.npm),
  ]);

  for (const engine of scored.filter((e) => !e.ours && e.fail > 0)) {
    assert.ok(covered.has(engine.npm),
      `«${engine.npm}» تُخفق في ${engine.fail} حالة ولا إبلاغ ولا سبب — ` +
      `أضفها إلى disclosures.json`);
  }

  for (const item of d.items) {
    assert.match(item.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/,
      `رابط المسألة عند «${item.npm}» ليس رابط مسألةٍ عامة`);
    assert.ok(page.includes(item.url), `مسألة «${item.npm}» غير معروضة على الصفحة`);
  }

  for (const item of d.not_reported) {
    assert.ok((item.reason ?? "").length > 10, `مانعُ الإبلاغ عند «${item.npm}» غير مفهوم`);
  }
});

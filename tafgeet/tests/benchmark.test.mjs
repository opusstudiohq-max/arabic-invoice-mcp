/**
 * اختبارات المقياس.
 *
 * المقياس أداة اتهام علنية — وأي خلل فيه يرتدّ علينا لا على من نقيسه.
 * لذلك يحرس هذا الملف ثلاثة أشياء: **عدالة المقارنة**، و**صدق الصفحة**،
 * و**ألا يُنشر ما لم يُقَس**.
 *
 * التشغيل:  node tafgeet-benchmark/tests/benchmark.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tafgeet } from "../../cheque-tool/js/tafgeet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BM = join(HERE, "..");
const cases = JSON.parse(readFileSync(join(BM, "cases.json"), "utf-8"));

test("محرّكنا يجتاز كل حالة — وإلا فالحالة خاطئة أو المحرّك", () => {
  const all = [
    ...cases.cases.map(c => ({ ...c, currency: c.currency || cases.currency })),
    ...cases.extra_currency_cases,
  ];
  const fails = all.filter(c => tafgeet(c.amount, c.currency) !== c.expected)
                   .map(c => `${c.amount} ${c.currency}: توقّعنا «${c.expected}» فجاء «${tafgeet(c.amount, c.currency)}»`);
  assert.deepEqual(fails, [], `${fails.length} إخفاق`);
  assert.ok(all.length >= 50, `الحالات ${all.length} — أقل من الحد`);
});

test("كل حالة تحمل قاعدة معرّفة — لا حكم بلا سند", () => {
  const ids = new Set(Object.keys(cases.rules));
  const all = [...cases.cases, ...cases.extra_currency_cases];
  const orphans = all.filter(c => !ids.has(c.rule)).map(c => `${c.amount}:${c.rule}`);
  assert.deepEqual(orphans, [], "حالات تشير لقواعد غير معرّفة");
  for (const [id, r] of Object.entries(cases.rules)) {
    assert.ok(r.name && r.text && r.text.length > 30, `القاعدة ${id} بلا نصّ كافٍ`);
  }
});

test("الحالات موضع الخلاف خارج التقييم فعلاً", () => {
  const scored = new Set([...cases.cases, ...cases.extra_currency_cases]
    .map(c => `${c.amount}|${c.currency || cases.currency}`));
  for (const c of cases.contested_cases) {
    assert.ok(!scored.has(`${c.amount}|${cases.currency}`),
      `الحالة ${c.amount} موضع خلاف ومع ذلك تدخل في التقييم`);
    assert.ok(c.candidates.length >= 2, `${c.amount}: الخلاف يحتاج صيغتين على الأقل`);
    assert.ok(c.why && c.why.length > 20, `${c.amount}: بلا سبب مكتوب`);
  }
});

test("النتائج مولَّدة والصفحة مطابقة لها — لا انحراف بين المنشور والمقيس", () => {
  const rPath = join(BM, "results.json");
  assert.ok(existsSync(rPath), "results.json غير موجود — شغّل run.mjs");
  const R = JSON.parse(readFileSync(rPath, "utf-8"));

  const ours = R.engines.find(e => e.id === "mutawafiq");
  assert.ok(ours, "محرّكنا غائب عن النتائج");
  assert.equal(ours.fail, 0, "محرّكنا مُخفق في النتائج المنشورة");

  execFileSync("node", [join(BM, "build.mjs")], { encoding: "utf-8" });
  const html = readFileSync(join(BM, "index.html"), "utf-8");

  // كل رقم في اللوحة موجود في الصفحة كما هو
  for (const e of R.engines.filter(x => !x.skipped)) {
    assert.ok(html.includes(`${e.rate}%`), `النسبة ${e.rate}% غائبة عن الصفحة`);
    assert.ok(html.includes(`>${e.pass}</strong> / ${e.total}`),
      `نتيجة ${e.name} (${e.pass}/${e.total}) غائبة عن الصفحة`);
  }
});

test("الصفحة قائمة بذاتها ومسؤولة في صياغتها", () => {
  const html = readFileSync(join(BM, "index.html"), "utf-8");
  const externals = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\//g)].map(m => m[0]);
  assert.deepEqual(externals, [], "مورد خارجي — الصفحة يجب أن تعمل بلا إنترنت");

  // الجداول كلها داخل حاوية تمرير — وإلا مُرِّرت الصفحة أفقياً على الجوال
  const tables = (html.match(/<table/g) || []).length;
  const wrapped = (html.match(/<div class="scroll"><table|<div class="scroll">\s*\n?<table/g) || []).length;
  assert.equal(wrapped, tables, `${tables - wrapped} جدول خارج حاوية التمرير`);

  // حدود المقارنة معلنة صراحةً
  assert.match(html, /ولا تحكم على المنتجات المقارَنة/, "غاب تحديد نطاق المقارنة");
  assert.match(html, /خارج التقييم/, "غاب قسم الحالات موضع الخلاف");
  assert.match(html, /أعد التشغيل بنفسك/, "غابت تعليمات إعادة الإنتاج");
});

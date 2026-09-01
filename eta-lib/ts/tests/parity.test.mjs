/**
 * تكافؤ نسخة TypeScript مع نسخة بايثون المرجعية ومع العيّنة الرسمية.
 *
 * معياران، لا واحد:
 *   ① المطابقة الحرفية للملف الرسمي `one-doc-serialized.json.txt`
 *   ② والتطابق مع مخرَج بايثون على كل حالة
 *
 * لأن نسختين تُنتجان هاشين مختلفين تعني أن إحداهما تُرفض عند الهيئة —
 * وهذا بالضبط ما حدث في محرّك التفقيط حين انحرفت نسخة TS عن بايثون في
 * 215 حالة من 540 دون أن ينتبه أحد.
 *
 * التشغيل:  node eta-lib/ts/tests/parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDocument, serializeDocument, canonicalHash } from "../dist/serialization.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "..");
const FIXTURES = join(LIB, "fixtures");

const DOC = join(FIXTURES, "one-doc.json");
const EXPECTED = join(FIXTURES, "one-doc-serialized.json.txt");

/** يشغّل نسخة بايثون على النصّ نفسه ويعيد مخرَجها. */
function pythonSerialize(jsonText) {
  const script = `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("s", r"${join(LIB, "src", "eta_invoice", "serialization.py")}")
m = importlib.util.module_from_spec(spec); sys.modules["s"] = m
spec.loader.exec_module(m)
raw = sys.stdin.read()
print(json.dumps({"s": m.serialize_document(m.load_document(raw)),
                  "h": m.canonical_hash(m.load_document(raw))}, ensure_ascii=False))
`;
  const out = execFileSync("python", ["-c", script], {
    input: jsonText, encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return JSON.parse(out);
}

test("① يطابق العيّنة الرسمية بايتاً ببايت", (t) => {
  if (!existsSync(DOC)) return t.skip("العيّنة الرسمية غير موجودة");
  const raw = readFileSync(DOC, "utf-8");
  const expected = readFileSync(EXPECTED, "utf-8").replace(/^﻿/, "").trim();
  const got = serializeDocument(loadDocument(raw));
  if (got !== expected) {
    const i = [...got].findIndex((c, k) => c !== expected[k]);
    assert.fail(`اختلاف عند ${i}:\n  المتوقَّع: …${expected.slice(Math.max(0, i - 50), i + 50)}\n  ناتجنا  : …${got.slice(Math.max(0, i - 50), i + 50)}`);
  }
});

test("② يطابق نسخة بايثون على العيّنة الرسمية", (t) => {
  if (!existsSync(DOC)) return t.skip("العيّنة الرسمية غير موجودة");
  const raw = readFileSync(DOC, "utf-8");
  const py = pythonSerialize(raw);
  assert.equal(serializeDocument(loadDocument(raw)), py.s);
});

test("③ يطابق بايثون على حالات حدّية", () => {
  const cases = [
    '{"a": 0.0}',
    '{"a": 0.00}',
    '{"a": 0}',
    '{"a": 1.500}',
    '{"a": -12.34}',
    '{"a": 1e3}',
    '{"a": true, "b": false, "c": null}',
    '{"a": "نصّ عربي"}',
    '{"a": "quote \\" inside"}',
    '{"a": "\\u0645\\u0631\\u062d\\u0628\\u0627"}',
    '{"items": []}',
    '{"items": [{"id": "1"}, {"id": "2"}]}',
    '{"tags": ["a", "b"]}',
    '{"a": {"b": {"c": "deep"}}}',
    '{"z": "1", "a": "2"}',
    '{"a":\n  "1" ,\n "b" : { "c" : "2" }\n}',
  ];
  const mismatches = [];
  for (const c of cases) {
    const py = pythonSerialize(c);
    const js = serializeDocument(loadDocument(c));
    if (js !== py.s) mismatches.push({ input: c, js, py: py.s });
  }
  assert.deepEqual(mismatches, [], `${mismatches.length} اختلاف`);
});

test("④ الهاش متطابق بين النسختين", async (t) => {
  if (!existsSync(DOC)) return t.skip("العيّنة الرسمية غير موجودة");
  const raw = readFileSync(DOC, "utf-8");
  const py = pythonSerialize(raw);
  assert.equal(await canonicalHash(loadDocument(raw)), py.h);
});

test("⑤ الشكل اللفظي للأرقام محفوظ — وهو ما يعجز عنه JSON.parse", () => {
  assert.equal(serializeDocument(loadDocument('{"a": 0.0}')), '"A""0.0"');
  assert.equal(serializeDocument(loadDocument('{"a": 0.00}')), '"A""0.00"');
  assert.equal(serializeDocument(loadDocument('{"a": 0}')), '"A""0"');
  // البرهان: JSON.parse يُسقط الفرق نهائياً
  assert.equal(JSON.parse('{"a":0.0}').a, JSON.parse('{"a":0.00}').a);
  assert.notEqual(
    serializeDocument(loadDocument('{"a": 0.0}')),
    serializeDocument(loadDocument('{"a": 0.00}')),
  );
});

test("⑥ المدخلات الفاسدة تُرفض بوضوح", () => {
  for (const bad of ['{"a": }', '{"a" "b"}', '{"a": 01x}', '{"a": "unclosed', "{", '{"a":1}x']) {
    assert.throws(() => loadDocument(bad), SyntaxError, `قُبل مدخل فاسد: ${bad}`);
  }
});

test("⑦ المصفوفة المجرّدة تُرفض — لأن اسمها جزء من الهاش", () => {
  assert.throws(() => serializeDocument(loadDocument('[{"a":"1"}]')), /مصفوفة/);
});

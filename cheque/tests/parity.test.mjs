/**
 * اختبار تكافؤ: محرّك التفقيط في المتصفح مقابل نسخة بايثون المرجعية.
 *
 * المبدأ: **لا نبيع دقة لا نقيسها.** الميزة البيعية الوحيدة لهذه الأداة هي
 * صحة التفقيط نحوياً، فلا يُسمح لنسخة المتصفح أن تنحرف عن المرجع بحرف.
 *
 * التشغيل:  node cheque-tool/tests/parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tafgeet, chequeWords, CURRENCY_DECIMALS } from "../js/tafgeet.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

/** يجمع مخرَج بايثون لكل الحالات دفعة واحدة — استدعاء واحد بدل مئات. */
function pythonTafgeet(cases) {
  const script = `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location(
    "srv", r"${path.join(ROOT, "arabic-invoice-mcp", "src", "arabic_invoice_mcp", "server.py")}")
m = importlib.util.module_from_spec(spec); sys.modules["srv"] = m
spec.loader.exec_module(m)
cases = json.loads(sys.stdin.read())
print(json.dumps([m.tafgeet(a, c) for a, c in cases], ensure_ascii=False))
`;
  const out = execFileSync("python", ["-c", script], {
    input: JSON.stringify(cases),
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return JSON.parse(out);
}

/** الحالات: حدود نحوية + عشوائي واسع + كل عملة. */
function buildCases() {
  const cases = [];
  const currencies = Object.keys(CURRENCY_DECIMALS);
  // حدود نحوية حرجة لكل عملة
  const edges = [0, 1, 2, 3, 10, 11, 12, 19, 20, 21, 99, 100, 101, 200, 999,
                 1000, 1001, 2000, 3000, 11000, 1000000, 2000000, 3000000];
  for (const c of currencies) for (const n of edges) cases.push([n, c]);
  // كسور حرجة (منزلتان وثلاث)
  for (const c of currencies) {
    const d = CURRENCY_DECIMALS[c];
    const fracs = d === 3
      ? [0.001, 0.002, 0.003, 0.011, 0.099, 0.75, 0.999]
      : [0.01, 0.02, 0.03, 0.11, 0.25, 0.75, 0.99];
    for (const f of fracs) cases.push([+(1234 + f).toFixed(d), c]);
  }
  // عيّنة عشوائية ثابتة (بذرة ثابتة — لا Math.random حتى يبقى الاختبار حتمياً)
  let seed = 20260821;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const c = currencies[Math.floor(rnd() * currencies.length)];
    const d = CURRENCY_DECIMALS[c];
    const v = +(rnd() * 9_999_999).toFixed(d);
    cases.push([v, c]);
  }
  return cases;
}

test("تكافؤ التفقيط: JS مطابق لبايثون على كل حالة", () => {
  const cases = buildCases();
  if (process.env.PARITY_COUNT) console.log("PARITY_CASES=" + cases.length);
  const expected = pythonTafgeet(cases);
  assert.equal(expected.length, cases.length, "عدد النتائج لا يطابق عدد الحالات");

  const mismatches = [];
  cases.forEach(([amount, currency], i) => {
    const got = tafgeet(amount, currency);
    if (got !== expected[i]) mismatches.push({ amount, currency, js: got, py: expected[i] });
  });

  assert.deepEqual(
    mismatches.slice(0, 8), [],
    `${mismatches.length} اختلاف من ${cases.length} حالة`
  );
  console.log(`  ✓ ${cases.length} حالة متطابقة عبر ${Object.keys(CURRENCY_DECIMALS).length} عملات`);
});

test("الحالات النحوية التي تميّزنا — مثبّتة صراحةً", () => {
  const fixed = [
    [2, "SAR", "ريالان"],
    [3, "SAR", "ثلاثة ريالات"],
    [11, "SAR", "أحد عشر ريالاً"],
    [2000, "EGP", "ألفا جنيه"],
    [103, "SAR", "مائة وثلاثة ريالات"],
    [0.02, "SAR", "هللتان"],
    [1, "EGP", "جنيه واحد"],
    [3000, "EGP", "ثلاثة آلاف جنيه"],
  ];
  for (const [n, c, want] of fixed) assert.equal(tafgeet(n, c), want, `${n} ${c}`);
  // الدينار ثلاث منازل: 0.750 = 750 فلساً لا 75
  assert.match(tafgeet(150.75, "KWD"), /سبعمائة وخمسون فلساً/);
});

test("خطأ الفاصلة العائمة لا يسرّب قرشاً", () => {
  // (1250.75 - 1250) * 100 = 74.99999999999997 في JS
  assert.match(tafgeet(1250.75, "EGP"), /خمسة وسبعون قرشاً/);
  assert.match(tafgeet(0.29, "EGP"), /تسعة وعشرون قرشاً/);
  assert.match(tafgeet(8.29, "EGP"), /تسعة وعشرون قرشاً/);
});

test("صيغة الشيك تضيف «فقط … لا غير»", () => {
  assert.equal(chequeWords(2, "EGP"), "فقط جنيهان لا غير");
  assert.match(chequeWords(1250.75, "EGP"), /^فقط .* لا غير$/);
});

test("المدخلات الفاسدة تُرفض بلا انهيار", () => {
  assert.match(tafgeet(NaN, "EGP"), /^خطأ/);
  assert.match(tafgeet(Infinity, "EGP"), /^خطأ/);
  assert.match(tafgeet(100, "XYZ"), /غير مدعومة/);
});

/**
 * مشغّل مقياس التفقيط العربي.
 *
 * المبدأ الحاكم: **الحَكَم قاعدة نحوية مسمّاة، لا محرّكنا.** كل حالة في
 * `cases.json` تحمل رقم القاعدة التي تختبرها، فمن يخالف حالةً يخالف القاعدة
 * لا رأينا — ويستطيع أن ينازع في القاعدة نفسها علناً.
 *
 * ولذلك يبدأ التشغيل بفحص **محرّكنا نحن**: إن أخفق في حالة، فإمّا الحالة
 * خاطئة أو المحرّك — ولا يُنشر مقياس قبل حسم ذلك.
 *
 * التشغيل:
 *   node tafgeet-benchmark/run.mjs              # المحرّكات المتاحة محلياً
 *   node tafgeet-benchmark/run.mjs --fetch      # يجلب المحرّكات العامة ويخزّنها
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { tafgeet as ourTafgeet } from "./engine.js";   // نسخة مُودَعة، يحرسها اختبار الانحراف

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "cache");
const UA = "OpusStudioBenchmark/1.0 (+https://opusstudiohq-max.github.io/arabic-invoice-mcp/; opus.studio.hq@gmail.com)";

const data = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf-8"));
const ALL = [
  ...data.cases.map(c => ({ ...c, currency: c.currency || data.currency })),
  ...data.extra_currency_cases,
];

/**
 * سجلّ المحرّكات.
 *
 * `fetch` — عنوان الملف العام. نجلبه **مرة واحدة ونخزّنه** ولا نكرّر الطلب،
 * ونشغّله محلياً في نطاق معزول. هذا فحصٌ لكودٍ منشور علناً، لا اختراق.
 * `adapt` — يحوّل واجهة المحرّك إلى `(amount, currency) => string`.
 */
const ENGINES = [
  {
    id: "mutawafiq",
    name: "مُتوافِق",
    note: "محرّكنا — منقول عن نسخة بايثون بـ176 اختباراً، ومُثبت التكافؤ على 540 حالة",
    local: true,
    run: (amount, currency) => ourTafgeet(amount, currency),
  },
  {
    id: "mutawafiq-ts",
    name: "مُتوافِق — بناء TypeScript المشحون",
    note: "البناء المشحون فعلاً (arabic-invoice-mcp-ts/dist) — لا نسخة المصدر. تُفحص هنا عمداً: من ينشر مقياساً للصحّة يبدأ بنفسه",
    local: true,
    // يُحمَّل ديناميكياً حتى لا يُسقط غيابُ dist المقياسَ كله
    run: null,
  },
  {
    id: "sheekprint",
    name: "sheekprint.com",
    note: "محرّك أداة طباعة شيكات مجانية مصرية",
    fetch: "https://www.sheekprint.com/_assets/js/tafgeet.js",
    adapt: (sandbox) => {
      const T = sandbox.Tafgeet || sandbox.tafgeet || sandbox.module?.exports;
      if (!T) return null;
      return (amount, currency) => {
        try {
          if (typeof T === "function") {
            // صيغة الصنف: new Tafgeet(amount, currency).parse()
            try { return new T(amount, currency).parse(); }
            catch { return String(T(amount, currency)); }
          }
          return null;
        } catch (e) { return `«خطأ تشغيل»: ${String(e).slice(0, 60)}`; }
      };
    },
  },
];

// ── التطبيع: نقارن المعنى لا التنسيق ────────────────────────────────────
/**
 * نُسقط ما لا يغيّر الصواب النحوي: التشكيل، وتطويل الحروف، والمسافات
 * الزائدة، وصيغ الألف. **ولا نُسقط التنوين** — فهو موضع الخلاف نفسه
 * («جنيهاً» مقابل «جنيه»)، وإسقاطه يُلغي المقياس.
 */
function normalize(s) {
  if (typeof s !== "string") return String(s);
  return s
    .replace(/[ؗ-ًؚ-ْٰـ]/g, "") // تشكيل وتطويل — عدا التنوين المعالَج أدناه
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .replace(/^فقط\s+/, "")
    .replace(/\s+لا\s*غير\.?$/, "")
    .trim();
}

/** التنوين يُحفظ صراحةً قبل التطبيع، فهو جوهر الخلاف. */
function withTanween(s) {
  return typeof s === "string" && /ً/.test(s);
}

function compare(expected, got) {
  if (got == null) return { ok: false, kind: "لا مخرَج" };
  if (/undefined|NaN|null/i.test(String(got))) return { ok: false, kind: "مخرَج مكسور" };
  const e = normalize(expected), g = normalize(got);
  if (e === g && withTanween(expected) === withTanween(got)) return { ok: true, kind: "مطابق" };
  if (e === g) return { ok: false, kind: "تنوين" };
  return { ok: false, kind: "اختلاف" };
}

// ── الجلب والتشغيل المعزول ──────────────────────────────────────────────
async function loadRemote(engine) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${engine.id}.js`);
  if (!existsSync(file)) {
    if (!process.argv.includes("--fetch")) return { skipped: "غير مخزّن — شغّل بـ--fetch" };
    const res = await fetch(engine.fetch, { headers: { "User-Agent": UA } });
    if (!res.ok) return { skipped: `HTTP ${res.status}` };
    writeFileSync(file, await res.text(), "utf-8");
  }
  const code = readFileSync(file, "utf-8");
  const sandbox = { module: { exports: {} }, exports: {}, console, window: {}, globalThis: {} };
  vm.createContext(sandbox);
  try { new vm.Script(code).runInContext(sandbox, { timeout: 5000 }); }
  catch (e) { return { skipped: `تعذر التشغيل: ${String(e).slice(0, 80)}` }; }
  const fn = engine.adapt(sandbox);
  return fn ? { run: fn } : { skipped: "لم يُعثر على دالة تفقيط في الملف" };
}

// ── التشغيل ─────────────────────────────────────────────────────────────
/** حزمتنا المبنيّة — تُستورد استيراداً حقيقياً لا بحيلة نصّية. */
async function loadOwnPackage() {
  // اسم مجلد الحزمة يختلف بين مستودع العمل والمستودع العام — نجرّب الاثنين
  const candidates = [
    join(HERE, "..", "arabic-invoice-mcp-ts", "dist", "tafgeet.js"),
    join(HERE, "..", "typescript-lib", "dist", "tafgeet.js"),
  ];
  const dist = candidates.find(existsSync);
  if (!dist) return { skipped: "dist غير مبنيّ — شغّل npm run build في مجلد الحزمة" };
  try {
    const mod = await import(pathToFileURL(dist).href);
    return { run: (a, c) => mod.tafgeet(a, c) };
  } catch (e) {
    return { skipped: `تعذر الاستيراد: ${String(e).slice(0, 80)}` };
  }
}

const results = [];
for (const engine of ENGINES) {
  const loaded = engine.id === "mutawafiq-ts"
    ? await loadOwnPackage()
    : engine.local ? { run: engine.run } : await loadRemote(engine);
  if (loaded.skipped) {
    results.push({ id: engine.id, name: engine.name, note: engine.note, skipped: loaded.skipped });
    continue;
  }
  const rows = ALL.map(c => {
    let got;
    try { got = loaded.run(c.amount, c.currency); }
    catch (e) { got = `«استثناء»: ${String(e).slice(0, 60)}`; }
    const cmp = compare(c.expected, got);
    return { amount: c.amount, currency: c.currency, rule: c.rule, expected: c.expected, got: String(got), ...cmp };
  });
  const pass = rows.filter(r => r.ok).length;
  results.push({
    id: engine.id, name: engine.name, note: engine.note,
    total: rows.length, pass, fail: rows.length - pass,
    rate: +(pass / rows.length * 100).toFixed(1),
    broken: rows.filter(r => r.kind === "مخرَج مكسور").length,
    rows,
  });
}

// ── الحارس: **كل** محرّك نملكه يجب أن يجتاز كل حالة ─────────────────────
//
// يشمل **البناء المشحون** عمداً — لا نسخة المصدر. فحين قِستُه أول مرة كان
// **19/50 (38%)** — أفضل من أضعف منافس بـ16 نقطة فقط، ونحن على وشك نشر
// مقياسٍ للصحّة النحوية. نشرُ المقياس حينها كان كذباً بالإغفال.
// وبوابة claims_lint لم تكن لتمسكه: ذاك انحراف **صحّة** لا انحراف **ادعاء**.
//
// **التخطّي ليس إخفاقاً هنا.** في المستودع العام لا يُحفظ مجلد dist (وهذا
// صواب)، فيتخطّى المشغّل هذا المدخل ويكمل — والمشغّل أداة عامة لا بوابة
// إصدار. أمّا الحارس الذي يمنع إصدارَنا نحن فمكانه الاختبار:
// `tests/no-drift.test.mjs` يفرض أن يكون البناء قد فُحص واجتاز.
const OURS = ["mutawafiq", "mutawafiq-ts"];
const failing = results.filter(r => OURS.includes(r.id) && !r.skipped && r.fail > 0);
if (failing.length) {
  console.error("\n✖ محرّك من محرّكاتنا أخفق — لا يُنشر مقياس قبل حسمه:\n");
  for (const r of failing) {
    if (r.skipped) { console.error(`  ${r.name}: ${r.skipped}\n`); continue; }
    console.error(`  ── ${r.name}: ${r.fail} إخفاق`);
    r.rows.filter(x => !x.ok).slice(0, 6).forEach(x =>
      console.error(`     ${x.amount} ${x.currency} [${x.rule}]  متوقَّع «${x.expected}» فأعطى «${x.got}»`));
  }
  process.exit(1);
}

const out = {
  generated_utc: new Date().toISOString().slice(0, 10),
  cases_total: ALL.length,
  rules: data.rules,
  engines: results,
};
writeFileSync(join(HERE, "results.json"), JSON.stringify(out, null, 2), "utf-8");

console.log(`\nحالات: ${ALL.length}\n`);
for (const r of results) {
  if (r.skipped) { console.log(`  ${r.name.padEnd(18)} — تخطّي: ${r.skipped}`); continue; }
  const brk = r.broken ? `، منها ${r.broken} مخرَج مكسور` : "";
  console.log(`  ${r.name.padEnd(18)} ${String(r.pass).padStart(3)}/${r.total}  (${r.rate}%)${brk}`);
}
console.log(`\n✓ results.json`);

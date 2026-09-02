/**
 * مشغّل مقياس رمز QR السعودي — المرحلة الأولى.
 *
 * ### المبدأ الحاكم
 *
 * **الحَكَم مصدرٌ مسمّى، لا محرّكنا.** كل حالة في `cases.json` تحمل قاعدتها،
 * وكل قاعدة تحمل مصدرها: نصّ المواصفة (§4.1) أو حسمٌ منشور في منتدى الهيئة.
 * فمن يخالف حالةً يخالف المصدر ويستطيع أن ينازع فيه علناً.
 *
 * ### ولماذا هذا المقياس أصلاً
 *
 * ذهبنا نفحص حزمة غيرنا، فوجدنا أن **الخطأ عندنا**: كودُنا كان يكتب الطول
 * في بايتٍ واحد، منقولاً حرفياً عن جملة «The length shall be stored in one
 * byte». وهي تبسيطٌ ينكسر عند 128 بايتاً — أي عند اسمٍ عربي من 64 حرفاً.
 * أصلحناه في ثلاث نسخ عندنا قبل أن نقيس أحداً، ثم قِسنا الميدان.
 *
 * ### الطريقة
 *
 * لكل محرّك يُستدعى مولّده بحقولٍ معلومة، ثم يُفكّ ناتجُه بـ`decode()`
 * أدناه — فاكٍّ **مكتوب هنا لا يستدعي كود أحد**، وإلا كان الحكم دائرياً.
 *
 *   npm install && node run.mjs && node build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf-8"));

/**
 * سجلّ الإبلاغ — يُضمّ إلى النتائج فتحمله الصفحة.
 *
 * **مقياسٌ يجد عيباً ولا يُبلغ صاحبه نميمةٌ مُحكمة.** فما وُجد هنا رُفع
 * مسألةً عامة عند كل مستودعٍ يقبلها، وما تعذّر يُذكر بسببه.
 */
const disclosures = (() => {
  try { return JSON.parse(readFileSync(join(HERE, "disclosures.json"), "utf-8")); }
  catch { return null; }
})();

// ── الفاكّ المستقل — مصدرُه `decode.mjs`، تقرؤه الصفحةُ أيضاً ──────────
import { decode } from "./decode.mjs";

/** `"ش×64"` ⇒ سلسلةٌ فعلية. تُكتب هكذا في `cases.json` لتبقى الحالات مقروءة. */
function expand(value) {
  const m = /^(.+)×(\d+)$/.exec(value ?? "");
  return m ? m[1].repeat(+m[2]) : value;
}

// ── سجلّ المحرّكات ───────────────────────────────────────────────────────
/**
 * `load` يحوّل واجهة كل حزمة إلى `(fields) => base64`. وحين تختلف الأسماء
 * أو تكون الواجهة كائناً، يُكتب المحوّل هنا — لا يُعدَّل كود الحزمة.
 *
 * وما لا يُصدّر مولّداً للمرحلة الأولى **لا يُسجَّل ولا يُنسب إليه إخفاق**:
 * تسجيلُ خزانةٍ على أنها فشلت في القيادة ليس قياساً.
 */
const F = (f) => ({ ...f, sellerName: expand(f.sellerName) });

/**
 * قالبُ فاتورة بسيطة لمن يقود بالـXML لا بالحقول.
 *
 * حزمتان هنا (`zatca-xml-js` وفرعُها `@pioneersoft`) تستخرجان الحقول من
 * مستند فاتورة UBL بدل أن تستقبلاها. فتُقادان من مدخلهما الطبيعي — بناءُ
 * مستندٍ يحمل الحقولَ نفسَها — لا بالتفافٍ على واجهتهما.
 */
const ublInvoice = (f) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
  <cbc:IssueDate>${f.timestamp.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${f.timestamp.slice(11, 19)}</cbc:IssueTime>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>${f.vatNumber}</cbc:CompanyID></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${f.sellerName}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${f.vatAmount}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxInclusiveAmount currencyID="SAR">${f.totalWithVat}</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

/** الحقول المطلوبة للمرحلة الثانية عند من لا يبني المرحلة الأولى وحدها. */
const PHASE2_STUB = {
  invoiceHash: "aGFzaA==", digitalSignature: "c2ln",
  publicKey: "a2V5", certificateSignature: "Y2VydA==",
};

/** «1000.00» ⇒ 100000 هللة — لمن يستقبل المبلغ عدداً صحيحاً. */
const halalas = (amount) => Math.round(Number(amount) * 100);

const ENGINES = [
  {
    id: "fatura", name: "فاتورة", name_en: "fatura (ours)", ours: true,
    note: "نسختنا — أُصلحت بعد أن كشفها هذا المقياس نفسه",
    load: async () => {
      const m = await import("../invoice-pdf/dist/zatca-qr.js");
      return (f) => m.encodeZatcaQr(F(f));
    },
  },
  {
    id: "mcp-ts", name: "خادم MCP — البناء المشحون",
    name_en: "arabic-invoice-mcp (ours, shipped build)", ours: true,
    note: "البناء المشحون فعلاً لا نسخة المصدر. يُفحص هنا عمداً: من ينشر مقياساً يبدأ بنفسه",
    load: async () => {
      const m = await import("../arabic-invoice-mcp-ts/dist/index.js");
      return (f) => m.buildZatcaQr(
        F(f).sellerName, f.vatNumber, f.timestamp, f.totalWithVat, f.vatAmount).base64_data;
    },
  },
  {
    id: "zatca-xml-js", name: "zatca-xml-js", npm: "zatca-xml-js",
    load: async () => {
      const { XMLDocument } = require("zatca-xml-js/lib/parser");
      const { generatePhaseOneQR } = require("zatca-xml-js");
      return (f) => generatePhaseOneQR({ invoice_xml: new XMLDocument(ublInvoice(F(f))) });
    },
  },
  {
    id: "axenda", name: "@axenda/zatca", npm: "@axenda/zatca",
    load: async () => {
      const { Tag, tagsToBase64 } = await import("@axenda/zatca");
      return (f) => tagsToBase64([
        new Tag(1, F(f).sellerName), new Tag(2, f.vatNumber), new Tag(3, f.timestamp),
        new Tag(4, f.totalWithVat), new Tag(5, f.vatAmount),
      ]);
    },
  },
  {
    id: "talha7k-qr", name: "@talha7k/zatca-qr", npm: "@talha7k/zatca-qr",
    load: async () => {
      const m = await import("@talha7k/zatca-qr");
      return (f) => m.generatePhase1QRCodeData({
        sellerName: F(f).sellerName, vatNumber: f.vatNumber,
        timestamp: f.timestamp, totalWithVat: f.totalWithVat, vatTotal: f.vatAmount,
      });
    },
  },
  {
    id: "talha7k", name: "@talha7k/zatca", npm: "@talha7k/zatca",
    load: async () => {
      const m = await import("@talha7k/zatca");
      return (f) => m.generatePhase1QRCodeData({
        sellerName: F(f).sellerName, vatNumber: f.vatNumber,
        timestamp: f.timestamp, totalWithVat: f.totalWithVat, vatTotal: f.vatAmount,
      });
    },
  },
  {
    id: "zatca-qr-tlv", name: "zatca-qr-tlv", npm: "zatca-qr-tlv",
    load: async () => {
      const m = await import("zatca-qr-tlv");
      return (f) => m.buildPhase1QR({
        sellerName: F(f).sellerName, vatNumber: f.vatNumber, timestamp: f.timestamp,
        totalHalalas: halalas(f.totalWithVat), vatHalalas: halalas(f.vatAmount),
      });
    },
  },
  {
    id: "zatca-sdk", name: "zatca-sdk", npm: "zatca-sdk",
    note: "يبني المرحلة الثانية فقط — تُمرَّر حقول التوقيع صورياً وتُفحص الوسوم 1-5",
    load: async () => {
      const m = await import("zatca-sdk");
      return (f) => m.generateTLVString({
        ...PHASE2_STUB, sellerName: F(f).sellerName, vatNumber: f.vatNumber,
        timestamp: f.timestamp, invoiceTotal: f.totalWithVat, vatTotal: f.vatAmount,
      });
    },
  },
  {
    id: "zatca-qr-generator", name: "zatca-qr-generator", npm: "zatca-qr-generator",
    load: async () => {
      const m = await import("zatca-qr-generator");
      return (f) => Buffer.concat([
        m.tlvEncode(1, F(f).sellerName), m.tlvEncode(2, f.vatNumber),
        m.tlvEncode(3, f.timestamp), m.tlvEncode(4, f.totalWithVat),
        m.tlvEncode(5, f.vatAmount),
      ]).toString("base64");
    },
  },
  {
    id: "zatca-simplified", name: "zatca-simplified-invoice-sdk", npm: "zatca-simplified-invoice-sdk",
    load: async () => {
      const m = await import("zatca-simplified-invoice-sdk");
      return (f) => m.buildQRCodeBase64({
        sellerName: F(f).sellerName, vatRegistrationNumber: f.vatNumber,
        timestamp: f.timestamp, invoiceTotal: f.totalWithVat, vatTotal: f.vatAmount,
      });
    },
  },
  {
    id: "pioneersoft", name: "@pioneersoft/zatca-einvoice", npm: "@pioneersoft/zatca-einvoice",
    load: async () => {
      const { XMLDocument } = require("@pioneersoft/zatca-einvoice/dist/parser");
      const { generatePhaseOneQR } = require("@pioneersoft/zatca-einvoice");
      return (f) => generatePhaseOneQR({ invoice_xml: new XMLDocument(ublInvoice(F(f))) });
    },
  },
  {
    id: "zatca-qr-scoped", name: "@zatca/qr", npm: "@zatca/qr",
    load: async () => {
      const m = await import("@zatca/qr");
      return (f) => m.createQRData({
        sellerName: F(f).sellerName, vatNumber: f.vatNumber,
        timestamp: f.timestamp, total: f.totalWithVat, vatTotal: f.vatAmount,
      });
    },
  },
  {
    id: "zatca", name: "zatca", npm: "zatca",
    note: "منشورة أيضاً باسم ‎@tatwerat/zatca",
    // **تحويلٌ مُعلَن في المدخل، لا التفافٌ صامت.**
    //
    // هذه الحزمة ترفض «2022-04-25T15:30:00Z» — وهي صيغة المثال في المواصفة
    // نفسها — لأن فحصها يشترط كسور الثواني: ‎/\d{2}:\d{2}:\d{2}.\d{3}Z/‎.
    // وترفض كذلك الإزاحة «+03:00»، وهي توقيت السعودية الفعلي.
    //
    // ولو تُركت ترفض لسجّلت 0/10، فقال الجدول إنها **تُخطئ الترميز** — وذاك
    // ليس ما قِيس. فتُقاد بالصيغة التي تقبلها ليُقاس ترميزُها فعلاً، ويبقى
    // الرفضُ نفسُه ظاهراً في حالة «الطابع الزمني كما أُعطي» وحدها.
    adapter_note: "ترفض «2022-04-25T15:30:00Z» وتشترط كسور الثواني ‎.000Z‎ — تُقاد بها ليُقاس الترميز",
    load: async () => {
      const m = await import("zatca");
      const Ctor = m.GenerateQrCode ?? m.default?.GenerateQrCode;
      return (f) => new Ctor(
        F(f).sellerName, f.vatNumber, f.timestamp.replace(/(?<!\.\d{3})Z$/, ".000Z"),
        f.totalWithVat, f.vatAmount).toBase64();
    },
  },
];

// ── الانتشار ────────────────────────────────────────────────────────────
/**
 * عدد التنزيلات الشهري من سجلّ npm.
 *
 * **لأن العيب يزنه من يشحنه.** خطأٌ في حزمةٍ تُنزَّل مئة مرة شهرياً ليس
 * كخطأٍ في حزمةٍ تُنزَّل سبعة عشر ألفاً. والرقم يُجلب مرّةً ويُخزَّن في
 * `downloads.json` بتاريخه — فلا يتبدّل الجدول تحت القارئ بين تشغيلين،
 * ولا يُطلب السجلّ في كل مرّة.
 *
 *   node run.mjs --fetch     # يُحدّث الأرقام
 */
const DOWNLOADS = join(HERE, "downloads.json");

async function loadDownloads(names) {
  let cache = {};
  try { cache = JSON.parse(readFileSync(DOWNLOADS, "utf-8")); } catch { /* أول تشغيل */ }
  if (!process.argv.includes("--fetch")) return cache;

  const counts = {};
  for (const name of names) {
    try {
      const res = await fetch(
        `https://api.npmjs.org/downloads/point/last-month/${name.replace("/", "%2F")}`,
        { headers: { "User-Agent": UA } });
      const body = await res.json();
      if (typeof body.downloads === "number") counts[name] = body.downloads;
    } catch { /* غيابُ رقمٍ أهون من رقمٍ مخترَع */ }
  }
  const fresh = { measured_utc: new Date().toISOString().slice(0, 10), counts };
  writeFileSync(DOWNLOADS, JSON.stringify(fresh, null, 2), "utf-8");
  return fresh;
}

const UA = "OpusStudioBenchmark/1.0 (+https://opusstudiohq-max.github.io/arabic-invoice-mcp/; opus.studio.hq@gmail.com)";

// ── تقييم حالة واحدة ────────────────────────────────────────────────────
/**
 * الحكم على البايتات لا على النصّ. وكل توقّع في `cases.json` يُترجم هنا إلى
 * فحصٍ واحد صريح — ويُرمى استثناءٌ على توقّعٍ لا يعرفه المشغّل، فلا يمرّ
 * توقّعٌ مكتوبٌ بلا فحص يقابله ويُحسب نجاحاً بالصمت.
 */
const CHECKS = {
  // بادئة لا مطابقة تامّة: مولّد المرحلة الثانية يزيد الوسوم 6-9 بحقّ،
  // فمطالبته بخمسةٍ فقط تسجيلُ إخفاقٍ على التزامٍ لم يدّعِه.
  tags: (want, tlv) => {
    const got = tlv.map((t) => t.tag);
    return want.every((t, i) => got[i] === t)
      ? null : `ترتيب الوسوم ${got.join("،")} والمتوقَّع أن يبدأ بـ${want.join("،")}`;
  },
  tag1_declared_length: (want, tlv) => {
    const t = tlv.find((x) => x.tag === 1);
    return t?.length === want ? null : `الطول المعلن للوسم 1 هو ${t?.length} والمتوقَّع ${want}`;
  },
  tag1_length_form: (want, tlv, raw) => {
    const t = tlv.find((x) => x.tag === 1);
    if (t?.form === want) return null;
    const b = Buffer.from(raw, "base64");
    return `شكل الطول «${t?.form}» والمتوقَّع «${want}» — بايت الطول 0x${b[1]?.toString(16)}`;
  },
  tag1_value_intact: (_want, tlv, _raw, fields) => {
    const t = tlv.find((x) => x.tag === 1);
    const want = expand(fields.sellerName);
    if (t?.value === want) return null;
    return `الاسم عاد بـ${[...(t?.value ?? "")].length} حرفاً بدل ${[...want].length}`;
  },
  tag3_value: (want, tlv) => {
    const t = tlv.find((x) => x.tag === 3);
    return t?.value === want ? null : `الطابع الزمني «${t?.value}» والمتوقَّع «${want}»`;
  },
  tag4_value: (want, tlv) => {
    const t = tlv.find((x) => x.tag === 4);
    return t?.value === want ? null : `الإجمالي «${t?.value}» والمتوقَّع «${want}»`;
  },
  tag5_value: (want, tlv) => {
    const t = tlv.find((x) => x.tag === 5);
    return t?.value === want ? null : `الضريبة «${t?.value}» والمتوقَّع «${want}»`;
  },
};

async function evaluate(run, testCase) {
  let raw;
  try { raw = await run(testCase.fields); }
  catch (e) { return { ok: false, why: `استثناء: ${String(e?.message ?? e).slice(0, 90)}` }; }

  if (typeof raw !== "string" || !raw) {
    return { ok: false, why: `المخرَج ليس نصّاً (${typeof raw})` };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return { ok: false, why: `المخرَج ليس Base64 — «${raw.slice(0, 30)}…»` };
  }

  let tlv;
  try { tlv = decode(raw); }
  catch (e) { return { ok: false, why: `لا يُفكّ: ${e.message}` }; }

  for (const [key, want] of Object.entries(testCase.expect)) {
    const check = CHECKS[key];
    if (!check) throw new Error(`توقّعٌ لا يعرفه المشغّل: «${key}» في الحالة ${testCase.id}`);
    const problem = check(want, tlv, raw, testCase.fields);
    if (problem) return { ok: false, why: problem };
  }
  return { ok: true };
}

// ── التشغيل ─────────────────────────────────────────────────────────────
const downloads = await loadDownloads(ENGINES.map((e) => e.npm).filter(Boolean));

const results = [];
for (const engine of ENGINES) {
  let run;
  try { run = await engine.load(); }
  catch (e) {
    results.push({
      id: engine.id, name: engine.name, npm: engine.npm, ours: !!engine.ours,
      note: engine.note, name_en: engine.name_en, adapter_note: engine.adapter_note,
      skipped: `تعذّر التحميل: ${String(e?.message ?? e).split("\n")[0].slice(0, 90)}`,
    });
    continue;
  }
  if (typeof run !== "function") {
    results.push({
      id: engine.id, name: engine.name, npm: engine.npm, ours: !!engine.ours,
      note: engine.note, name_en: engine.name_en, adapter_note: engine.adapter_note,
      skipped: "لا يُصدّر مولّداً للمرحلة الأولى",
    });
    continue;
  }

  const rows = [];
  for (const c of data.cases) rows.push({ id: c.id, rule: c.rule, ...(await evaluate(run, c)) });
  const monthly = engine.npm ? downloads.counts?.[engine.npm] : undefined;
  const pass = rows.filter((r) => r.ok).length;
  results.push({
    id: engine.id, name: engine.name, npm: engine.npm, ours: !!engine.ours,
    note: engine.note, name_en: engine.name_en,
    adapter_note: engine.adapter_note, monthly_downloads: monthly,
    total: rows.length, pass, fail: rows.length - pass,
    rate: +(pass / rows.length * 100).toFixed(1),
    rows,
  });
}

// ── الحارس: **كل** محرّك نملكه يجب أن يجتاز كل حالة ─────────────────────
//
// وقد أخفق محرّكانا هنا أول مرة — في حالتَي 0x81 و0x82 — وذاك سببُ وجود
// هذا المقياس. فمن ينشر مقياساً للصحّة يبدأ بنفسه، ولا يُنشر قبل أن يمرّ.
const failingOurs = results.filter((r) => r.ours && !r.skipped && r.fail > 0);
const skippedOurs = results.filter((r) => r.ours && r.skipped);
if (failingOurs.length || skippedOurs.length) {
  console.error("\n✖ محرّك من محرّكاتنا لم يمرّ — لا يُنشر مقياس قبل حسمه:\n");
  for (const r of skippedOurs) console.error(`  ${r.name}: ${r.skipped}`);
  for (const r of failingOurs) {
    console.error(`  ── ${r.name}: ${r.fail} إخفاق`);
    r.rows.filter((x) => !x.ok).forEach((x) => console.error(`     [${x.rule}] ${x.id} — ${x.why}`));
  }
  process.exit(1);
}

const out = {
  generated_utc: new Date().toISOString().slice(0, 10),
  downloads_measured_utc: downloads.measured_utc,
  cases_total: data.cases.length,
  sources: data.sources,
  rules: data.rules,
  cases: data.cases,
  disclosures,
  engines: results,
};
writeFileSync(join(HERE, "results.json"), JSON.stringify(out, null, 2), "utf-8");

console.log(`\nحالات: ${data.cases.length}\n`);
for (const r of [...results].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))) {
  if (r.skipped) { console.log(`  ${r.name.padEnd(32)} — تخطّي: ${r.skipped}`); continue; }
  console.log(`  ${r.name.padEnd(32)} ${String(r.pass).padStart(3)}/${r.total}  (${r.rate}%)`);
}
console.log(`\n✓ results.json`);

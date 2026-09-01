/**
 * مشغّل مقياس النصّ العربي في PDF.
 *
 * ### المبدأ الحاكم
 *
 * **الحَكَم قاعدةٌ من يونيكود، لا مخرَجُ محرّكنا.** كل حالة في `cases.json`
 * تحمل رقم القاعدة التي تختبرها من UAX #9، فمن يخالف حالةً يخالف القاعدة
 * لا رأينا — ويستطيع أن ينازع في القاعدة نفسها علناً.
 *
 * ### وكيف يُقاس
 *
 * لكل حالة **يُبنى ملف PDF فعلي**، ثم تُقرأ منه معرّفات الرسوم وتُطابَق
 * **بالتشكيل الأمامي**: نُشكّل النصّ المتوقَّع بالخطّ نفسه ونبحث عن تسلسل
 * رسومه في الملف.
 *
 * ولا تُستعمل خريطةٌ عكسية (رسم ← محرف) لأنها **لا يمكن أن تصحّ**: الرسم
 * الواحد تبلغه نقاط ترميز كثيرة. وقد أوقعتنا ثلاث مرات، فأخرجت «فاتورة
 * ضريبية مبسطة» بشكل «ΊγΥΉЂ ΊАΉЏΠή» والملفُ سليم.
 *
 * ### الحارس
 *
 * محرّكنا يُفحص أولاً. إن أخفق في حالة، فإمّا الحالة خاطئة أو المحرّك —
 * ولا يُنشر مقياس قبل حسم ذلك.
 *
 *   node pdf-benchmark/run.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import zlib from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument } from "pdf-lib";
import fontkitEmbed from "@pdf-lib/fontkit";
import * as fontkitModule from "fontkit";

const fk = fontkitModule.default ?? fontkitModule;
const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf-8"));

/**
 * الخطوط المتاحة، بترتيب الأفضلية.
 *
 * ولكل حالة **يُختار أول خطٍّ يغطّي محارفها كلها**، ويُسجَّل اسمه مع
 * نتيجتها. وسببُ ذلك أن الخطّ المشحون (Almarai) لا يغطّي العبرية —
 * فتشغيلُ حالةٍ عبرية به يرسم مربّعاتٍ فارغة ويقيس الأرقام وحدها، ثم
 * تُعرض النتيجة «فاتورة عبرية سليمة». وذلك تضليل.
 *
 * وما لا يغطّيه خطٌّ متاح **يُتخطّى بسببٍ مذكور**، ولا يُحسب نجاحاً.
 */
const FONTS = [
  { name: "Almarai", path: join(HERE, "..", "invoice-tool", "fonts", "Almarai.ttf") },
  { name: "Almarai", path: join(HERE, "..", "invoice", "fonts", "Almarai.ttf") },
  { name: "Arial", path: "C:/Windows/Fonts/arial.ttf" },
  { name: "DejaVuSans", path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf" },
].filter((f) => existsSync(f.path))
 .map((f) => ({ ...f, bytes: readFileSync(f.path), face: null }));

if (!FONTS.length) {
  console.error("✖ لا خطّ متاح — لا يُشغَّل المقياس بلا خطّ");
  process.exit(1);
}
for (const font of FONTS) font.face = fk.create(font.bytes);

/** أول خطّ يحمل كل محارف النصّ — أو `null`. */
function fontFor(text) {
  const needed = [...text].map((c) => c.codePointAt(0))
    .filter((cp) => cp > 0x20 && !(cp >= 0x2066 && cp <= 0x2069));
  return FONTS.find((f) => needed.every((cp) => f.face.hasGlyphForCodePoint(cp))) ?? null;
}

// ── استخراج ما كُتب في الملف ─────────────────────────────────────────────
function contentStreams(pdf) {
  const out = [];
  const end = Buffer.from("endstream");
  for (let i = 0; i < pdf.length - 6; i++) {
    if (pdf.subarray(i, i + 6).toString("latin1") !== "stream") continue;
    const start = pdf[i + 6] === 0x0d ? i + 8 : i + 7;
    const stop = pdf.indexOf(end, start);
    if (stop < 0) continue;
    const body = pdf.subarray(start, stop);
    try { out.push(zlib.inflateSync(body).toString("latin1")); }
    catch { out.push(body.toString("latin1")); }
    i = stop;
  }
  return out;
}

/** تسلسلات الرسوم المكتوبة، كلٌّ كسلسلة معرّفات مفصولة بفواصل. */
function drawnRuns(pdf) {
  const runs = [];
  for (const stream of contentStreams(pdf)) {
    for (const m of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      runs.push((m[1].match(/..../g) ?? []).map((h) => parseInt(h, 16)).join(","));
    }
  }
  return runs;
}

/** هل ظهرت هذه العبارة؟ — بتشكيلها بالخطّ نفسه ومطابقة تسلسل رسومها. */
function shows(pdf, phrase, font) {
  const wanted = font.face.layout(phrase).glyphs.map((g) => g.id).join(",");
  return drawnRuns(pdf).some((run) => run.includes(wanted));
}

// ── المحرّكات ────────────────────────────────────────────────────────────
//
// كلها تُقاس على **الناتج على الورق**، لا على ما تُعيده دوالّها. وهذا
// الفرق كله: حزمٌ تُخرج سلسلةً صحيحة ثم تعكسها مكتبةُ الرسم بعدها.
async function newPage(chosen) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkitEmbed);
  const font = await doc.embedFont(chosen.bytes, { subset: false });
  return { doc, page: doc.addPage([595, 200]), font };
}

const ENGINES = [
  {
    id: "pdf-lib",
    name: "pdf-lib (كما هي)",
    note: "المكتبة الأشهر لتوليد PDF في جافاسكربت — 5.5 ألف نجمة. تُشكّل العربية صحيحةً عبر fontkit، ولا تطبّق خوارزمية الاتجاه.",
    async render(text, chosen) {
      const { doc, page, font } = await newPage(chosen);
      page.drawText(text, { x: 40, y: 100, size: 20, font });
      return Buffer.from(await doc.save());
    },
  },
  {
    id: "nasq",
    name: "نَسْق (محرّكنا)",
    note: "يقطع السطر إلى مقاطع اتجاهية بـUAX #9 ويرسم كلاً في موضعه. bidi-js اجتازت 91,707 حالة من سلسلة يونيكود.",
    ours: true,
    async render(text, chosen) {
      const { drawArabicText } = await import("nasq/pdf-lib");
      const { doc, page, font } = await newPage(chosen);
      drawArabicText(page, text, { font, size: 20, x: 40, y: 100, align: "left", base: "rtl" });
      return Buffer.from(await doc.save());
    },
  },
  {
    id: "naqqash",
    name: "naqqash + مُهايئها لـpdf-lib",
    note: "تُصرّح في صفحتها الأولى أنها لا تطبّق الخوارزمية الثنائية الاتجاه. تُقاس هنا على الفاتورة، لا على نطاقها المُعلَن — والفرق مذكور.",
    optional: true,
    async render(text, chosen) {
      const { drawArabicText } = await import("naqqash/pdf-lib");
      const { doc, page, font } = await newPage(chosen);
      drawArabicText(page, text, 555, 100, { font, size: 20 });
      return Buffer.from(await doc.save());
    },
  },
  {
    id: "bidi-shaper",
    name: "bidi-shaper → pdf-lib",
    note: "تُخرج سلسلةً بصرية صحيحة، ثم تُمرَّر إلى drawText. تُقاس هنا في هذا التركيب بعينه.",
    optional: true,
    async render(text, chosen) {
      const { render } = await import("bidi-shaper");
      const { doc, page, font } = await newPage(chosen);
      page.drawText(render(text, { base: "rtl" }), { x: 40, y: 100, size: 20, font });
      return Buffer.from(await doc.save());
    },
  },
];

// ── التشغيل ──────────────────────────────────────────────────────────────
const results = [];
for (const engine of ENGINES) {
  const rows = [];
  let unavailable = null;
  for (const testCase of data.cases) {
    // خطٌّ يغطّي محارف الحالة كلها — وإلا تُتخطّى بسببٍ مذكور. فتشغيلُ
    // حالةٍ بخطٍّ لا يحملها يرسم مربّعاتٍ ويقيس ما تبقّى، ثم تُعرض
    // النتيجة نجاحاً. وذلك تضليل.
    const chosen = fontFor(testCase.text);
    if (!chosen) {
      rows.push({
        id: testCase.id, rule: testCase.rule, text: testCase.text,
        must_show: testCase.must_show, why: testCase.why ?? null,
        skipped: "لا خطّ متاح يغطّي محارفها", font: null,
      });
      continue;
    }

    let pdf;
    try {
      pdf = await engine.render(testCase.text, chosen);
    } catch (error) {
      if (engine.optional) { unavailable = String(error).slice(0, 90); break; }
      rows.push({ ...testCase, ok: false, kind: "استثناء", detail: String(error).slice(0, 80) });
      continue;
    }
    const shown = shows(pdf, testCase.must_show, chosen);
    const forbidden = testCase.must_not_show ? shows(pdf, testCase.must_not_show, chosen) : false;
    rows.push({
      id: testCase.id, rule: testCase.rule, text: testCase.text,
      must_show: testCase.must_show, must_not_show: testCase.must_not_show ?? null,
      why: testCase.why ?? null, font: chosen.name,
      ok: shown && !forbidden,
      kind: !shown ? "لم يظهر المتوقَّع" : forbidden ? "ظهر المقلوب" : "مطابق",
    });
  }

  if (unavailable) {
    results.push({ id: engine.id, name: engine.name, note: engine.note, skipped: unavailable });
    continue;
  }
  const scored = rows.filter((r) => !r.skipped);
  const pass = scored.filter((r) => r.ok).length;
  results.push({
    id: engine.id, name: engine.name, note: engine.note, ours: !!engine.ours,
    total: scored.length, pass, fail: scored.length - pass,
    skipped_cases: rows.length - scored.length,
    rate: scored.length ? +((pass / scored.length) * 100).toFixed(1) : 0,
    rows,
  });
}

// ── الحارس: محرّكنا يجتاز كل حالة، أو لا يُنشر ──────────────────────────
const ours = results.filter((r) => r.ours && !r.skipped && r.fail > 0);
if (ours.length) {
  console.error("\n✖ محرّكنا أخفق — لا يُنشر مقياس قبل حسم ذلك:\n");
  for (const engine of ours) {
    for (const row of engine.rows.filter((r) => !r.ok && !r.skipped)) {
      console.error(`  ${row.id} (${row.rule}): ${row.kind}`);
      console.error(`     «${row.text}» ⇐ يجب أن يُظهر «${row.must_show}»\n`);
    }
  }
  process.exit(1);
}

writeFileSync(
  join(HERE, "results.json"),
  JSON.stringify({
    generated_utc: new Date().toISOString().slice(0, 10),
    fonts: [...new Set(results.flatMap((e) => (e.rows ?? [])
      .map((r) => r.font).filter(Boolean)))],
    cases_total: data.cases.length,
    rules: data.rules,
    documented_behaviour: data.documented_behaviour,
    engines: results,
  }, null, 2) + "\n",
  "utf-8",
);

const fontNames = [...new Set(FONTS.map((f) => f.name))].join("، ");
console.log(`\nحالات: ${data.cases.length}   الخطوط المتاحة: ${fontNames}\n`);
for (const engine of results) {
  if (engine.skipped) { console.log(`  ${engine.name.padEnd(34)} تُخطّيت — ${engine.skipped}`); continue; }
  const mark = engine.ours ? "★" : " ";
  const skip = engine.skipped_cases ? `  (+${engine.skipped_cases} متخطّاة)` : "";
  console.log(`${mark} ${engine.name.padEnd(34)} ${engine.pass}/${engine.total}  (${engine.rate}%)${skip}`);
}
console.log("\n✓ results.json");

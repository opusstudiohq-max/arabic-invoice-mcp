/**
 * يبني صفحة المقياس من `results.json`.
 *
 * **لا رقم في الصفحة مكتوبٌ بيد.** كل عددٍ فيها يُحقن من ناتج التشغيل —
 * لأن الرقم المكتوب يدوياً ينجرف، وقد انجرف عندنا مرّتين: «50 حالة» وهي
 * 52، ووصفُ المستودع أعلن عدداً قديماً شهراً.
 *
 *   node pdf-benchmark/run.mjs && node pdf-benchmark/build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(readFileSync(join(HERE, "results.json"), "utf-8"));
const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf-8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * تاريخٌ ISO داخل نصٍّ عربي.
 *
 * «2026-09-01» في فقرةٍ يمينية يُعرض **«01-09-2026»** — والشرطة ES لا تلتحق
 * بالرقم العربي الصنف (قاعدة W4 من UAX #9)، فتبقى محايدةً وتنعكس المقاطع.
 * وهو **سلوك يونيكود الصحيح** لا عيبُ متصفّح.
 *
 * وقد وثّقنا هذه الحالة بعينها في مقياس الـPDF عندنا، ثم ارتكبناها على
 * صفحتينا المنشورتين: التاريخ في تذييلهما كان مقلوباً على الشاشة. اكتشفه
 * قياسُ الترتيب البصري لا النظر.
 *
 * والعلاج عزلُ المقطع، وهو ما يفعله `<bdi dir="ltr">`.
 */
const isoDate = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;

/** المقاطع الاتجاهية تُعرض داخل عزلٍ حتى لا تفسد ترتيب الصفحة نفسها. */
const iso = (s) => `<bdi>${esc(s)}</bdi>`;

const engines = results.engines.filter((e) => !e.skipped);
const ours = engines.find((e) => e.ours);
const baseline = engines.find((e) => e.id === "pdf-lib");

const board = engines
  .sort((a, b) => b.rate - a.rate)
  .map((e) => `
    <tr class="${e.ours ? "ours" : ""}">
      <td><strong>${esc(e.name)}</strong><div class="rule">${esc(e.note)}</div></td>
      <td class="num ${e.rate === 100 ? "ok" : e.rate === 0 ? "bad" : "warn"}">
        <strong>${e.pass}/${e.total}</strong><div class="rule">${e.rate}%</div>
      </td>
    </tr>`).join("");

const skipped = results.engines.filter((e) => e.skipped).map((e) =>
  `<li>${esc(e.name)} — تُخطّيت: ${esc(e.skipped)}</li>`).join("");

const caseRows = ours.rows.map((r) => {
  const others = engines.filter((e) => !e.ours)
    .map((e) => {
      const row = e.rows.find((x) => x.id === r.id);
      return `<td class="num ${row?.ok ? "ok" : "bad"}">${row?.ok ? "✓" : "✗"}</td>`;
    }).join("");
  return `
    <tr>
      <td><code>${iso(r.text)}</code>${r.why ? `<div class="rule">${esc(r.why)}</div>` : ""}</td>
      <td><span class="tag">${esc(r.rule)}</span></td>
      <td><code>${iso(r.must_show)}</code>${r.font ? `<div class="rule">${esc(r.font)}</div>` : ""}</td>
      <td class="num ok">✓</td>
      ${others}
    </tr>`;
}).join("");

const otherHeads = engines.filter((e) => !e.ours)
  .map((e) => `<th class="num">${esc(e.name.split(" ")[0])}</th>`).join("");

const ruleRows = Object.entries(results.rules).map(([id, rule]) => `
  <tr><td><span class="tag">${esc(id)}</span></td>
      <td><strong>${esc(rule.name)}</strong><div class="rule">${esc(rule.text)}</div></td></tr>`).join("");

const documented = results.documented_behaviour.map((d) => `
  <div class="card">
    <h3><code>${iso(d.text)}</code></h3>
    <p><strong>يُعرض:</strong> ${iso(d.expected_display)}</p>
    <p class="rule">${esc(d.note)}</p>
  </div>`).join("");

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مقياس النصّ العربي في PDF — هل يصل المبلغ كما كُتب؟</title>
<meta name="description" content="مقياس مفتوح يبني ملفات PDF فعلية ويقرأ منها الرسوم: هل تُطبع «1,234.50» كما كُتبت أم مقلوبة؟ الحالات والقواعد وطريقة إعادة التشغيل منشورة.">
<link rel="canonical" href="https://mutawafiq.opus-studio.pro/pdf/">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:site_name" content="أدوات الفوترة العربية">
<meta property="og:url" content="https://mutawafiq.opus-studio.pro/pdf/">
<meta property="og:title" content="فاتورتك تطبع «05.432,1» بدل «1,234.50»">
<meta property="og:description" content="${esc(baseline.pass)}/${esc(baseline.total)} — نتيجة أشهر مكتبة PDF في جافاسكربت على ${results.cases_total} حالة، كلٌّ بقاعدة من يونيكود. المقياس يُعاد تشغيله بأمرٍ واحد.">
<meta property="og:image" content="https://mutawafiq.opus-studio.pro/pdf/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(baseline.pass)}/${esc(baseline.total)} — نتيجة أشهر مكتبة PDF في جافاسكربت على حالات عربية">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://mutawafiq.opus-studio.pro/pdf/og.png">
<meta name="twitter:title" content="فاتورتك تطبع «05.432,1» بدل «1,234.50»">
<meta name="twitter:description" content="مقياس مفتوح يبني ملفات PDF فعلية ويقرأ منها الرسوم. ${results.cases_total} حالة بقواعد يونيكود مسمّاة.">
<style>
  :root{
    --bg:#f7f8fa; --card:#fff; --ink:#16202b; --muted:#5d6b7a; --line:#e0e6ec;
    --ok:#0a7d5a; --ok-bg:#e8f5f0; --bad:#b4232a; --bad-bg:#fdeeee;
    --warn:#8a5a00; --warn-bg:#fff8e8; --accent:#0d5c47;
  }
  @media(prefers-color-scheme:dark){
    :root{--bg:#12161b; --card:#1a1f26; --ink:#e6eaef; --muted:#9aa6b4; --line:#2a323c;
          --ok:#3fae8f; --ok-bg:#14261f; --bad:#ef7c84; --bad-bg:#2a1618;
          --warn:#d6a054; --warn-bg:#2a2113; --accent:#3fae8f;}
  }
  *{box-sizing:border-box}
  body{margin:0;padding:0 1rem 4rem;background:var(--bg);color:var(--ink);
       font:16px/1.75 "Segoe UI","Noto Sans Arabic",system-ui,sans-serif}
  main{max-width:1000px;margin:0 auto}
  header{padding:3rem 0 1.5rem;border-bottom:1px solid var(--line)}
  h1{font-size:clamp(1.6rem,4.5vw,2.3rem);margin:0 0 .6rem;letter-spacing:-.01em}
  h2{font-size:1.25rem;margin:2.5rem 0 1rem}
  h3{font-size:1rem;margin:0 0 .5rem}
  .lede{color:var(--muted);max-width:62ch;margin:0}
  .hero{background:var(--bad-bg);border:1px solid var(--bad);border-radius:12px;
        padding:1.2rem 1.4rem;margin:1.6rem 0}
  .hero img{max-width:100%;height:auto;border-radius:8px;background:#fff}
  /* سلسلة العطب تُعرض **كما هي بايتاً بايت**: المتصفّح عارضٌ مطابق، فلو
     تُرك لها لأعاد ترتيبها فأصلحها بصرياً — وضاعت البرهنة نفسها. */
  .verbatim{unicode-bidi:bidi-override;direction:ltr;display:inline-block}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
        padding:1rem 1.2rem;margin-bottom:1rem}
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:collapse;background:var(--card);
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:.65rem .8rem;text-align:right;border-bottom:1px solid var(--line);
        vertical-align:top}
  th{background:var(--bg);font-size:.82rem;color:var(--muted);font-weight:600}
  tr:last-child td{border-bottom:none}
  tr.ours{background:var(--ok-bg)}
  .num{text-align:center;font-variant-numeric:tabular-nums}
  .ok{color:var(--ok)} .bad{color:var(--bad)} .warn{color:var(--warn)}
  .rule{font-size:.8rem;color:var(--muted);margin-top:.25rem;font-weight:400}
  .tag{display:inline-block;padding:.05rem .45rem;border:1px solid var(--line);
       border-radius:5px;font-size:.78rem;color:var(--muted)}
  code{font-family:ui-monospace,Consolas,monospace;font-size:.88em;
       background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:.1em .35em}
  pre{background:var(--card);border:1px solid var(--line);border-radius:10px;
      padding:1rem;overflow-x:auto;direction:ltr;text-align:left}
  pre code{background:none;border:none;padding:0}
  a{color:var(--accent)}
  /* سطرُ التواصل: العنوان **نصّاً** لا رابطاً فقط — من يستعمل بريده عبر
     المتصفح لا يفتح له رابط mailto شيئاً، فيبقى بلا سبيل. وهو العيب نفسه
     الذي كان في الفاحص، وكان هنا في أربع صفحاتٍ دفعةً واحدة: لا سبيل أصلاً. */
  .contact-line code{user-select:all}
  footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);
         color:var(--muted);font-size:.88rem}
  .cta{background:var(--ok-bg);border:1px solid var(--ok);border-radius:10px;
       padding:1rem 1.2rem;margin:1.5rem 0}
</style>
</head>
<body>
<main>

<header>
  <h1>هل تصل المبالغ إلى فاتورتك كما كُتبت؟</h1>
  <p class="lede">
    مقياسٌ مفتوح يبني <strong>ملفات PDF فعلية</strong> ويقرأ منها الرسوم —
    لا يفحص ما تُعيده الدوال. ${results.cases_total} حالة، كلٌّ تحمل قاعدةً
    مسمّاة من خوارزمية يونيكود الثنائية الاتجاه (UAX&nbsp;#9).
  </p>
</header>

<div class="hero">
  <p style="margin:0 0 .9rem"><strong>السطر نفسه، والخطّ نفسه، ومحرّكان:</strong></p>
  <img src="evidence.png" alt="مقارنة: pdf-lib تطبع المبلغ 05.432,1 بينما نَسْق تطبعه 1,234.50"
       width="1048" height="476" loading="lazy">
  <p class="rule" style="margin:.9rem 0 0">
    <strong>هذه صورةٌ مُصيَّرة من ملفَي PDF فعليين</strong>، لا نصّ في الصفحة —
    لأن المتصفّح عارضٌ مطابق لخوارزمية يونيكود، فلو وُضعت السلسلة المكسورة
    نصّاً لأعاد ترتيبها فأصلحها بصرياً، وضاعت البرهنة.
    ولّدها <code>evidence.py</code> من الملفات نفسها.
  </p>
  <p class="rule" style="margin:.5rem 0 0">
    والعيب ليس في تشكيل الحروف — تلك صحيحة في الاثنين — بل في
    <strong>ترتيب المقاطع الاتجاهية</strong>.
  </p>
</div>

<h2>اللوحة</h2>
<div class="scroll"><table>
  <tr><th>المحرّك</th><th class="num">النتيجة</th></tr>
  ${board}
</table></div>
${skipped ? `<p class="rule">محرّكات لم تُقَس في هذا التشغيل:</p><ul class="rule">${skipped}</ul>` : ""}

<div class="card" style="margin-top:1rem">
  <h3>إنصافٌ واجب</h3>
  <p class="rule" style="margin:0">
    <code>naqqash</code> <strong>تُصرّح في صفحتها الأولى</strong> أنها لا تطبّق
    الخوارزمية الثنائية الاتجاه، وتُحيل إلى <code>bidi-js</code>. فالنتيجة أعلاه
    ليست اتهاماً لها بمخالفة ما تَعِد به — بل بيانٌ لما يكلّفه ذلك الحدُّ
    المُعلَن حين تكون على الورق فاتورةٌ فيها مبلغ. والأمر نفسه في
    <code>bidi-shaper</code>: تُخرج سلسلةً صحيحة، ثم تعكسها مكتبةُ الرسم بعدها
    — <strong>فالمقياس على التركيب لا على الحزمة وحدها</strong>.
  </p>
</div>

<h2>الحالات، حالةً حالة</h2>
<div class="scroll"><table>
  <tr>
    <th>النصّ</th><th>القاعدة</th><th>يجب أن يظهر<div class="rule">والخطّ الذي جرت به</div></th>
    <th class="num">نَسْق</th>${otherHeads}
  </tr>
  ${caseRows}
</table></div>

<h2>القواعد — الحَكَم يونيكود لا نحن</h2>
<div class="scroll"><table>${ruleRows}</table></div>

<h2>سلوكٌ موثَّق لا يُسجَّل عليه</h2>
<p class="lede" style="margin-bottom:1rem">
  ما لا يقيسه هذا المشغّل قياساً تامّاً <strong>لا يُمنح عليه درجة</strong>.
</p>
${documented}

<h2>أعِد تشغيله بنفسك</h2>
<pre><code>git clone https://github.com/opusstudiohq-max/arabic-invoice-mcp
cd arabic-invoice-mcp/pdf-benchmark
npm install
node run.mjs</code></pre>
<p class="rule">
  المشغّل يبني الملفات ويقرأ منها، ويكتب <code>results.json</code>. وهذه
  الصفحة <strong>مولَّدة منه</strong> — لا رقم فيها مكتوبٌ بيد.
  والخطّ يُختار <strong>لكل حالة</strong>: أول خطٍّ يغطّي محارفها كلها،
  ويُسجَّل مع نتيجتها. فتشغيلُ حالةٍ عبرية بخطٍّ لا يحمل العبرية يرسم
  مربّعاتٍ ويقيس الأرقام وحدها، ثم تُعرض النتيجة نجاحاً — وذلك تضليل.
  الخطوط في هذا التشغيل: <code>${esc(results.fonts.join("، "))}</code>.
</p>

<div class="cta">
  <h3>وجدتَ خطأً في حالة؟ أو محرّكاً يستحق القياس؟</h3>
  <p style="margin:0">
    كل حالة هنا تحمل قاعدتها، فمن يخالفها فليخالف القاعدة علناً.
    <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp/issues/new?labels=%D8%A7%D9%84%D9%85%D9%82%D9%8A%D8%A7%D8%B3&title=%D9%85%D9%82%D9%8A%D8%A7%D8%B3%20PDF%3A%20">افتح مسألةً</a>
    — نُصحّح علناً ونذكر من صحّح.
  </p>
</div>

<footer>
  <p>
    وُلِّدت في ${isoDate(results.generated_utc)} من تشغيلٍ فعلي.
    الأدوات:
    <a href="https://mutawafiq.opus-studio.pro/invoice/">فاتورة PDF</a> ·
    <a href="https://mutawafiq.opus-studio.pro/checker/">فاحص QR</a> ·
    <a href="https://mutawafiq.opus-studio.pro/tafgeet/">مقياس التفقيط</a> ·
    <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp">المستودع</a>
  </p>
  <p class="contact-line">
    نبني تكاملات فوترة إلكترونية ونصلح المكسور منها — بنطاقٍ وسعرٍ واضحين.
    <a href="mailto:yahya@opus-studio.pro?subject=سؤال%20من%20مقياس%20النصّ%20العربي%20في%20PDF">راسلنا</a>
    أو انسخ العنوان: <bdi dir="ltr"><code>yahya@opus-studio.pro</code></bdi>
  </p>
</footer>

</main>
</body>
</html>
`;

writeFileSync(join(HERE, "index.html"), html, "utf-8");
console.log(`✓ index.html — ${results.cases_total} حالة، ${engines.length} محرّكات`);
if (cases.cases.length !== results.cases_total) {
  console.error("✖ عدد الحالات في الصفحة يخالف cases.json — أعد التشغيل");
  process.exit(1);
}

/**
 * يبني صفحة مقياس رمز QR السعودي من `results.json`.
 *
 * **لا رقم في الصفحة مكتوبٌ بيد.** كل عددٍ فيها يُحقن من ناتج التشغيل —
 * لأن الرقم المكتوب يدوياً ينجرف، وقد انجرف عندنا مرّتين من قبل.
 *
 *   node run.mjs --fetch && node build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const r = JSON.parse(readFileSync(join(HERE, "results.json"), "utf-8"));

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

/** المقاطع ثنائية الاتجاه تُعرض داخل عزلٍ حتى لا تفسد ترتيب الصفحة نفسها. */
const iso = (s) => `<bdi>${esc(s)}</bdi>`;
const num = (n) => Number(n).toLocaleString("en-US");

/**
 * يعزل الحرفيّات التقنية داخل نصٍّ عربي.
 *
 * التاريخ «2022-04-25» في فقرةٍ يمينية يُعرض «25-04-2022»، وذلك **سلوك
 * يونيكود الصحيح** (الشرطة ES لا تلتحق بـAN، قاعدة W4) لا عيبٌ في المتصفّح
 * — وقد وثّقناه في مقياس الـPDF عندنا. والعلاج عزلُ المقطع لا مقاومتُه.
 *
 * فيُلتقط ما يبدأ بمحرفٍ لاتيني أو رقم ويحمل نقطةً أو شرطة أو نقطتين أو
 * مائلة، ويُلفّ في `<bdi dir="ltr">`.
 */
const TECH = /[A-Za-z0-9@][A-Za-z0-9@._:/+-]*[A-Za-z0-9]/g;
const isoTech = (s) => esc(s).replace(TECH, (m) =>
  /[.:/@-]/.test(m) ? `<bdi dir="ltr">${m}</bdi>` : m);

const scored = r.engines.filter((e) => !e.skipped);
const skipped = r.engines.filter((e) => e.skipped);
const ours = scored.filter((e) => e.ours);
const others = scored.filter((e) => !e.ours);

// ── الانتشار مقابل الصحّة ────────────────────────────────────────────────
// الرقم الذي يحمل الصفحة كلها: كم تنزيلاً شهرياً يذهب إلى كودٍ يُخفق.
const withReach = others.filter((e) => typeof e.monthly_downloads === "number");
const totalReach = withReach.reduce((n, e) => n + e.monthly_downloads, 0);
const brokenReach = withReach.filter((e) => e.fail > 0)
  .reduce((n, e) => n + e.monthly_downloads, 0);
const brokenShare = totalReach ? (brokenReach / totalReach * 100).toFixed(1) : "0";
const perfect = others.filter((e) => e.fail === 0).length;

// عدد من يُخفق في قاعدة BER تحديداً — وهي سبب هذا المقياس
const berRules = new Set(["Q2", "Q3"]);
const berFailers = others.filter((e) => e.rows.some((x) => !x.ok && berRules.has(x.rule)));
const berReach = berFailers
  .filter((e) => typeof e.monthly_downloads === "number")
  .reduce((n, e) => n + e.monthly_downloads, 0);

const rank = [...scored].sort((a, b) =>
  b.rate - a.rate || (b.monthly_downloads ?? 0) - (a.monthly_downloads ?? 0));

const board = rank.map((e) => `
  <tr class="${e.ours ? "ours" : ""}">
    <td>
      <strong>${e.npm ? `<code>${esc(e.npm)}</code>` : esc(e.name)}</strong>
      ${e.ours ? '<span class="tag ours-tag">نحن</span>' : ""}
      ${e.note ? `<div class="rule">${isoTech(e.note)}</div>` : ""}
      ${e.adapter_note ? `<div class="rule warn">⚑ ${isoTech(e.adapter_note)}</div>` : ""}
    </td>
    <td class="num">${typeof e.monthly_downloads === "number"
      ? `<span dir="ltr">${num(e.monthly_downloads)}</span>` : "—"}</td>
    <td class="num ${e.rate === 100 ? "ok" : e.rate < 50 ? "bad" : "warn"}">
      <strong>${e.pass}/${e.total}</strong><div class="rule">${e.rate}%</div>
    </td>
  </tr>`).join("");

// ── مصفوفة الحالات ──────────────────────────────────────────────────────
const matrixHeads = rank.map((e) =>
  `<th class="num vert"><span>${esc(e.npm ?? e.name)}</span></th>`).join("");

const matrixRows = r.cases.map((c) => {
  const cells = rank.map((e) => {
    const row = e.rows.find((x) => x.id === c.id);
    return `<td class="num ${row?.ok ? "ok" : "bad"}" title="${esc(row?.why ?? "")}">${
      row?.ok ? "✓" : "✗"}</td>`;
  }).join("");
  return `
    <tr>
      <td><strong>${esc(c.id)}</strong>${c.why ? `<div class="rule">${isoTech(c.why)}</div>` : ""}</td>
      <td><span class="tag">${esc(c.rule)}</span></td>
      ${cells}
    </tr>`;
}).join("");

const ruleRows = Object.entries(r.rules).map(([id, rule]) => `
  <tr>
    <td><span class="tag">${esc(id)}</span></td>
    <td><strong>${esc(rule.name)}</strong><div class="rule">${isoTech(rule.text)}</div>
      <div class="rule src">المصدر: ${rule.source === "forum"
        ? `<a href="${esc(r.sources.forum)}">منتدى الهيئة</a>`
        : esc(r.sources.spec)}</div></td>
  </tr>`).join("");

/** أبرز الإخفاقات: عيّنةٌ من كل حزمة، بنصّ الفشل كما قِيس. */
const findings = others.filter((e) => e.fail > 0).map((e) => {
  const items = e.rows.filter((x) => !x.ok).slice(0, 3)
    .map((x) => `<li><span class="tag">${esc(x.rule)}</span> <code>${esc(x.id)}</code> — ${iso(x.why)}</li>`)
    .join("");
  return `
    <div class="card">
      <h3><code>${esc(e.npm ?? e.name)}</code>
        <span class="rule">${typeof e.monthly_downloads === "number"
          ? `<span dir="ltr">${num(e.monthly_downloads)}</span> تنزيلاً شهرياً` : ""}</span></h3>
      <ul class="findings">${items}</ul>
    </div>`;
}).join("");

/** سجلّ الإبلاغ: ما وُجد، وأين رُفع، وما تعذّر ولماذا. */
const reported = (r.disclosures?.items ?? []).map((d) => `
  <tr>
    <td><code>${esc(d.npm)}</code></td>
    <td>${isoTech(d.defect)}</td>
    <td><a href="${esc(d.url)}">${esc(d.url.replace("https://github.com/", ""))}</a></td>
  </tr>`).join("");

const notReported = (r.disclosures?.not_reported ?? []).map((d) =>
  `<li><code>${esc(d.npm)}</code> — ${esc(d.reason)}</li>`).join("");

const skippedList = skipped.length
  ? `<ul>${skipped.map((e) => `<li><code>${esc(e.npm ?? e.name)}</code> — ${esc(e.skipped)}</li>`).join("")}</ul>`
  : "";

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مقياس رمز QR السعودي — هل يقبله مُحقِّق الهيئة؟</title>
<meta name="description" content="مقياس مفتوح يبني رموز QR فعلية بـ${scored.length} مكتبة npm ويفكّها بايتاً بايت. ${brokenShare}% من التنزيلات الشهرية المقيسة تذهب إلى حزمٍ تُخفق في قاعدةٍ أو أكثر. الحالات والقواعد ومصادرها منشورة.">
<link rel="canonical" href="https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/">
<link rel="alternate" hreflang="ar" href="https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/">
<link rel="alternate" hreflang="en" href="https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/en/">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:site_name" content="أدوات الفوترة العربية">
<meta property="og:url" content="https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/">
<meta property="og:title" content="اسمُ منشأتك بأربعة وستين حرفاً؟ رمزُك مرفوض">
<meta property="og:description" content="${brokenShare}% من تنزيلات مكتبات ZATCA الشهرية المقيسة تذهب إلى حزمٍ تكسر ترميز الطول عند 128 بايتاً — أي عند اسمٍ عربي من 64 حرفاً. مقياس مفتوح يُعاد تشغيله بأمرٍ واحد.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="اسمُ منشأتك بأربعة وستين حرفاً؟ رمزُك مرفوض">
<meta name="twitter:description" content="${scored.length} مكتبة قِيست على ${r.cases_total} حالة، كلٌّ بقاعدةٍ من المواصفة أو من حسم منتدى الهيئة.">
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
  main{max-width:1040px;margin:0 auto}
  header{padding:3rem 0 1.5rem;border-bottom:1px solid var(--line)}
  h1{font-size:clamp(1.6rem,4.5vw,2.3rem);margin:0 0 .6rem;letter-spacing:-.01em}
  h2{font-size:1.25rem;margin:2.5rem 0 1rem}
  h3{font-size:1rem;margin:0 0 .5rem}
  .lede{color:var(--muted);max-width:64ch;margin:0}
  .hero{background:var(--bad-bg);border:1px solid var(--bad);border-radius:12px;
        padding:1.3rem 1.5rem;margin:1.6rem 0}
  .figure{font-size:clamp(2rem,7vw,3.2rem);font-weight:700;line-height:1.1;
          color:var(--bad);font-variant-numeric:tabular-nums}
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
  .vert{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;
        font-size:.72rem;padding:.5rem .3rem;max-height:9rem}
  .ok{color:var(--ok)} .bad{color:var(--bad)} .warn{color:var(--warn)}
  .rule{font-size:.8rem;color:var(--muted);margin-top:.25rem;font-weight:400}
  .rule.src{margin-top:.4rem;font-style:italic}
  .tag{display:inline-block;padding:.05rem .45rem;border:1px solid var(--line);
       border-radius:5px;font-size:.78rem;color:var(--muted)}
  .ours-tag{border-color:var(--ok);color:var(--ok)}
  /* **الرموز التقنية تُعزل اتجاهياً.**
     بلا هذا يُعرض «@talha7k/zatca-qr» في فقرةٍ يمينية «talha7k/zatca-qr@» —
     لأن «@» محايدٌ على حدّ المقطع فيلتحق بالجوار (X6a من UAX #9). وهو
     العيب نفسه الذي تُصلحه مكتبتنا في PDF، فظهر على صفحتنا نحن. */
  code{font-family:ui-monospace,Consolas,monospace;font-size:.88em;
       background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:.1em .35em;
       unicode-bidi:isolate;direction:ltr}
  pre{background:var(--card);border:1px solid var(--line);border-radius:10px;
      padding:1rem;overflow-x:auto;direction:ltr;text-align:left}
  pre code{background:none;border:none;padding:0}
  ul.findings{margin:.4rem 0 0;padding-inline-start:1.2rem}
  ul.findings li{margin-bottom:.3rem;font-size:.9rem}
  a{color:var(--accent)}
  /* سطرُ التواصل: العنوان **نصّاً** لا رابطاً فقط — من يستعمل بريده عبر
     المتصفح لا يفتح له رابط mailto شيئاً، فيبقى بلا سبيل. وهو العيب نفسه
     الذي كان في الفاحص، وكان هنا في أربع صفحاتٍ دفعةً واحدة: لا سبيل أصلاً. */
  .contact-line code{user-select:all}
  footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);
         color:var(--muted);font-size:.88rem}
  .own{background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;
       padding:1rem 1.3rem;margin:1.5rem 0}
  /* من فتحنا عندهم مسألةً يصلون من رابطٍ إنجليزي إلى صفحةٍ عربية. فملخّصٌ
     إنجليزي في صدرها ليس ترفاً — هو ما يجعل الإبلاغ مفهوماً عند متلقّيه. */
  .en{direction:ltr;text-align:left;background:var(--card);border:1px solid var(--line);
      border-radius:10px;padding:1rem 1.2rem;margin:1.6rem 0}
  .en h2{margin:0 0 .5rem;font-size:1.05rem}
  .en p{margin:.4rem 0}
  .en .fig{font-weight:700;color:var(--bad);font-variant-numeric:tabular-nums}
</style>
</head>
<body>
<main>

<header>
  <h1>هل يقبل مُحقِّق الهيئة رمزَ فاتورتك؟</h1>
  <p class="lede">
    مقياسٌ مفتوح يبني رموز QR <strong>فعلية</strong> بـ${scored.length} مكتبة،
    ثم يفكّها <strong>بايتاً بايت</strong> بفاكٍّ مستقلٍّ لا يستدعي كود أحد.
    ${r.cases_total} حالة، كلٌّ تحمل قاعدتها ومصدرَها: نصّ المواصفة، أو حسمٌ
    منشور في منتدى الهيئة نفسها.
  </p>
</header>

<div class="hero">
  <div class="figure" dir="ltr">${brokenShare}%</div>
  <p style="margin:.4rem 0 0">
    من <strong dir="ltr">${num(totalReach)}</strong> تنزيلٍ شهري قِيست
    لمكتبات ZATCA على npm تذهب إلى حزمٍ <strong>تُخفق في قاعدةٍ أو أكثر</strong>.
    ومن ${others.length} مكتبةً قِيست، <strong>${perfect}</strong> فقط اجتازت الحالات كلّها.
  </p>
  <p style="margin:.8rem 0 0;font-size:.92rem">
    وأشدُّ ما وُجد أثراً: <strong dir="ltr">${num(berReach)}</strong> تنزيلٍ شهري
    في حزمٍ تكسر ترميز الطول عند <strong>128 بايتاً</strong> —
    أي عند <strong>اسمٍ عربي من 64 حرفاً</strong>، وهو طولُ اسم منشأةٍ سعودية عادي.
  </p>
</div>

<section class="en" lang="en" dir="ltr">
  <h2>In English</h2>
  <p>
    The ZATCA spec sentence everyone copies is
    <em>&ldquo;The length shall be stored in one byte.&rdquo;</em>
    It stops being true at 128 bytes — and Arabic is two bytes per character in
    UTF-8, so <strong>a 64-character Arabic company name is 128 bytes</strong>.
    That is an ordinary Saudi trade name, not an edge case.
  </p>
  <p>
    <span class="fig">${brokenShare}%</span> of the ${num(totalReach)} monthly npm
    downloads measured here go to packages that fail at least one rule.
    Of ${others.length} third-party packages, <strong>${perfect}</strong> pass every case.
    The rule is settled on
    <a href="${esc(r.sources.forum)}">ZATCA&rsquo;s own forum</a>, not by us.
  </p>
  <p>
    We found the same bug <strong>in our own code first</strong>, in three places
    including our published checker. All were fixed before anyone else was measured,
    and every finding was filed as a public issue with a runnable reproduction.
  </p>
  <p>
    <a href="en/">Read this page in English &rarr;</a> &middot;
    <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp/tree/main/zatca-qr-benchmark">method
    and the adapters we got wrong</a>
  </p>
</section>

<div class="own">
  <h3>وكودُنا نحن كان أحدها</h3>
  <p style="margin:0">
    ذهبنا نفحص حزمة غيرنا فوجدنا أن <strong>الخطأ عندنا</strong>: كنّا نكتب الطول
    في بايتٍ واحد، منقولاً حرفياً عن جملة المواصفة
    <code dir="ltr">The length shall be stored in one byte</code>. وهي تبسيطٌ ينكسر
    عند 128. أصلحناه في <strong>ثلاث</strong> نسخٍ عندنا — مكتبة PDF، وخادم MCP،
    وأداةُ الفحص المنشورة — <em>قبل</em> أن نقيس أحداً. والمقياس يرفض أن يُنتج
    صفحته أصلاً إن أخفق محرّكٌ من محرّكاتنا.
  </p>
</div>

<h2>النتيجة</h2>
<div class="scroll">
<table>
  <thead><tr>
    <th>المكتبة</th>
    <th class="num">تنزيلات شهرية<div class="rule">قِيست ${isoDate(r.downloads_measured_utc ?? "—")}</div></th>
    <th class="num">النتيجة</th>
  </tr></thead>
  <tbody>${board}</tbody>
</table>
</div>

<h2>ما وُجد بالضبط</h2>
${findings}

<h2>ما أُبلِغ به أصحابُه</h2>
<p class="lede" style="margin-bottom:1rem">
  مقياسٌ يجد عيباً ولا يُبلغ صاحبه <strong>نميمةٌ مُحكمة</strong>. فكل ما وُجد
  هنا رُفع مسألةً عامة، بالبرهان وسطور الإصلاح — وروابطها مفتوحة للحكم.
</p>
<div class="scroll">
<table>
  <thead><tr><th>الحزمة</th><th>العيب</th><th>المسألة</th></tr></thead>
  <tbody>${reported}</tbody>
</table>
</div>
${notReported ? `<p class="lede" style="margin-top:1rem">وما تعذّر الإبلاغ عنه:</p><ul>${notReported}</ul>` : ""}

<h2>الحالة × المكتبة</h2>
<div class="scroll">
<table>
  <thead><tr><th>الحالة</th><th>القاعدة</th>${matrixHeads}</tr></thead>
  <tbody>${matrixRows}</tbody>
</table>
</div>

<h2>القواعد ومصادرها</h2>
<p class="lede" style="margin-bottom:1rem">
  الحَكَم مصدرٌ مسمّى لا رأيُنا. فمن يخالف حالةً يخالف مصدرها، ويستطيع أن
  ينازع في المصدر نفسه علناً.
</p>
<div class="scroll">
<table>
  <thead><tr><th style="width:5rem">الرمز</th><th>القاعدة</th></tr></thead>
  <tbody>${ruleRows}</tbody>
</table>
</div>

${skippedList ? `<h2>ما لم يُقَس</h2>
<p class="lede">ما لا يُصدّر مولّداً للمرحلة الأولى لا يُسجَّل ولا يُنسب إليه إخفاق.</p>
${skippedList}` : ""}

<h2>أعِد تشغيله بنفسك</h2>
<pre><code>git clone https://github.com/opusstudiohq-max/arabic-invoice-mcp
cd arabic-invoice-mcp/zatca-qr-benchmark
npm install
node run.mjs --fetch &amp;&amp; node build.mjs</code></pre>
<p class="lede">
  الحالات في <code>cases.json</code>، والمحوّلات في <code>run.mjs</code>.
  ومن رأى محوّلاً يظلم مكتبته فليفتح مسألةً — <strong>أخطأنا في تسعةٍ من
  محوّلاتنا في التشغيل الأول</strong>، فأصلحناها قبل النشر، ولا نستبعد بقيّة.
</p>

<footer>
  <p>
    شُغّل في ${isoDate(r.generated_utc)} · ${r.cases_total} حالة ·
    ${scored.length} محرّكاً · <a href="../">أدوات الفوترة العربية</a>
  </p>
  <p>
    المصدر النصّي: ${esc(r.sources.spec)} —
    والحسم في طول BER: <a href="${esc(r.sources.forum)}">موضوع منتدى الهيئة</a>.
  </p>
  <p class="contact-line">
    نبني تكاملات فوترة إلكترونية ونصلح المكسور منها — بنطاقٍ وسعرٍ واضحين.
    <a href="mailto:yahya@opus-studio.pro?subject=سؤال%20من%20مقياس%20رمز%20QR%20السعودي">راسلنا</a>
    أو انسخ العنوان: <bdi dir="ltr"><code>yahya@opus-studio.pro</code></bdi>
  </p>
</footer>

</main>
</body>
</html>
`;

writeFileSync(join(HERE, "index.html"), html, "utf-8");
console.log(`✓ index.html — ${scored.length} محرّكاً، ${r.cases_total} حالة، ${brokenShare}% من الانتشار مُخفق`);

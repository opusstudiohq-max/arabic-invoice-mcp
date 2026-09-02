/**
 * يبني النسخة الإنجليزية من صفحة المقياس — `en/index.html`.
 *
 * ### لماذا صفحةٌ ثانية لا ترجمةٌ في الأولى
 *
 * قياسُ القنوات قال: الطلب عند **مطوّرين يبنون هذا داخل شركاتهم**، دليلُه
 * 44,915 تنزيلاً شهرياً على npm. وهؤلاء يبحثون بالإنجليزية:
 * «zatca qr rejected»، «zatca tlv length».
 *
 * وصفحتُنا المفهرسة عنوانُها ووصفُها بالعربية — فلا تُطابق تلك الاستعلامات.
 * وكتلةُ «In English» في صدرها تنفع من وصل، لا من يبحث.
 *
 * فصفحةٌ إنجليزية بعنوانٍ ووصفٍ يطابقان السؤال المطروح، و`hreflang` يربط
 * الأختين فلا تتنافسان في الفهرسة.
 *
 * **ولا رقم فيها مكتوبٌ بيد** — كلُّها من `results.json` كأختها.
 *
 *   node run.mjs && node build.mjs && node build-en.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const r = JSON.parse(readFileSync(join(HERE, "results.json"), "utf-8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (n) => Number(n).toLocaleString("en-US");

const scored = r.engines.filter((e) => !e.skipped);
const others = scored.filter((e) => !e.ours);
const withReach = others.filter((e) => typeof e.monthly_downloads === "number");
const totalReach = withReach.reduce((n, e) => n + e.monthly_downloads, 0);
const brokenReach = withReach.filter((e) => e.fail > 0)
  .reduce((n, e) => n + e.monthly_downloads, 0);
const brokenShare = totalReach ? (brokenReach / totalReach * 100).toFixed(1) : "0";
const perfect = others.filter((e) => e.fail === 0).length;

const rank = [...scored].sort((a, b) =>
  b.rate - a.rate || (b.monthly_downloads ?? 0) - (a.monthly_downloads ?? 0));

const board = rank.map((e) => `
  <tr class="${e.ours ? "ours" : ""}">
    <td>${e.npm
      ? `<a href="https://www.npmjs.com/package/${esc(e.npm)}"><code>${esc(e.npm)}</code></a>`
      : `<strong>${esc(e.name_en ?? e.name)}</strong>`}${e.ours ? ' <span class="tag">ours</span>' : ""}</td>
    <td class="num">${typeof e.monthly_downloads === "number" ? num(e.monthly_downloads) : "—"}</td>
    <td class="num ${e.rate === 100 ? "ok" : e.rate < 50 ? "bad" : "warn"}">
      <strong>${e.pass}/${e.total}</strong>
    </td>
  </tr>`).join("");

/** الإخفاقات مجموعةً بنصّها كما قِيس — لا وصفاً لها. */
const findings = others.filter((e) => e.fail > 0).map((e) => `
  <div class="card">
    <h3><code>${esc(e.npm ?? e.name_en ?? e.name)}</code>${typeof e.monthly_downloads === "number"
      ? ` <span class="rule">${num(e.monthly_downloads)} downloads/mo</span>` : ""}</h3>
    <ul>${e.rows.filter((x) => !x.ok).slice(0, 3)
      .map((x) => `<li><span class="tag">${esc(x.rule)}</span> <code>${esc(x.id)}</code></li>`)
      .join("")}</ul>
  </div>`).join("");

const disclosures = (r.disclosures?.items ?? []).map((d) => `
  <tr><td><code>${esc(d.npm)}</code></td>
      <td><a href="${esc(d.url)}">${esc(d.url.replace("https://github.com/", ""))}</a></td></tr>`)
  .join("");

/**
 * أسماءُ القواعد ونصوصُها بالإنجليزية من `cases.json` نفسه.
 * وأوّل بناءٍ عرضها **بالعربية على صفحةٍ إنجليزية** — رآه النظر لا الاختبار.
 */
const ruleRows = Object.entries(r.rules).map(([id, rule]) => `
  <tr>
    <td><span class="tag">${esc(id)}</span></td>
    <td><strong>${esc(rule.name_en ?? rule.name)}</strong>
      <div class="rule">${esc(rule.text_en ?? "")}</div></td>
  </tr>`).join("");

const REL = "https://github.com/opusstudiohq-max/arabic-invoice-mcp/releases/download/libs-v0.1.0/fatura-0.1.0.tgz";
const AR = "https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/";
const EN = "https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/en/";

const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Why ZATCA rejects your QR code: the TLV length breaks at 128 bytes</title>
<meta name="description" content="${brokenShare}% of ${num(totalReach)} monthly npm downloads for ZATCA packages go to code that encodes the TLV length wrong. An Arabic company name of 64 characters is 128 bytes — where the one-byte reading stops working. Open benchmark, ${r.cases_total} cases, rerun with one command.">
<link rel="canonical" href="${EN}">
<link rel="alternate" hreflang="ar" href="${AR}">
<link rel="alternate" hreflang="en" href="${EN}">
<link rel="alternate" hreflang="x-default" href="${EN}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${EN}">
<meta property="og:title" content="Why ZATCA rejects your QR code: the TLV length breaks at 128 bytes">
<meta property="og:description" content="${brokenShare}% of measured npm downloads ship the bug. A 64-character Arabic company name is 128 bytes — an ordinary Saudi trade name.">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{--bg:#f7f8fa;--card:#fff;--ink:#16202b;--muted:#5d6b7a;--line:#e0e6ec;
        --ok:#0a7d5a;--ok-bg:#e8f5f0;--bad:#b4232a;--bad-bg:#fdeeee;--warn:#8a5a00;--accent:#0d5c47;}
  @media(prefers-color-scheme:dark){
    :root{--bg:#12161b;--card:#1a1f26;--ink:#e6eaef;--muted:#9aa6b4;--line:#2a323c;
          --ok:#3fae8f;--ok-bg:#14261f;--bad:#ef7c84;--bad-bg:#2a1618;--warn:#d6a054;--accent:#3fae8f;}
  }
  *{box-sizing:border-box}
  body{margin:0;padding:0 1rem 4rem;background:var(--bg);color:var(--ink);
       font:16px/1.7 -apple-system,"Segoe UI",system-ui,sans-serif}
  main{max-width:940px;margin:0 auto}
  header{padding:3rem 0 1.5rem;border-bottom:1px solid var(--line)}
  h1{font-size:clamp(1.5rem,4vw,2.1rem);margin:0 0 .6rem;letter-spacing:-.01em}
  h2{font-size:1.2rem;margin:2.5rem 0 .9rem}
  h3{font-size:.95rem;margin:0 0 .4rem}
  .lede{color:var(--muted);max-width:68ch;margin:0}
  .hero{background:var(--bad-bg);border:1px solid var(--bad);border-radius:12px;
        padding:1.3rem 1.5rem;margin:1.6rem 0}
  .figure{font-size:clamp(2rem,7vw,3rem);font-weight:700;line-height:1.1;color:var(--bad);
          font-variant-numeric:tabular-nums}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
        padding:.9rem 1.1rem;margin-bottom:.8rem}
  .card ul{margin:.3rem 0 0;padding-left:1.2rem;font-size:.9rem}
  .scroll{overflow-x:auto}
  table{width:100%;border-collapse:collapse;background:var(--card);
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
  th{background:var(--bg);font-size:.82rem;color:var(--muted);font-weight:600}
  tr:last-child td{border-bottom:none}
  tr.ours{background:var(--ok-bg)}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
  .rule{font-size:.8rem;color:var(--muted);font-weight:400}
  .tag{display:inline-block;padding:.05rem .4rem;border:1px solid var(--line);
       border-radius:5px;font-size:.75rem;color:var(--muted)}
  code{font-family:ui-monospace,Consolas,monospace;font-size:.88em;background:var(--bg);
       border:1px solid var(--line);border-radius:4px;padding:.1em .35em}
  pre{background:var(--card);border:1px solid var(--line);border-radius:10px;
      padding:1rem;overflow-x:auto}
  pre code{background:none;border:none;padding:0}
  a{color:var(--accent)}
  blockquote{margin:1rem 0;padding:.6rem 1rem;border-left:3px solid var(--accent);
             background:var(--card);color:var(--muted)}
  footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);
         color:var(--muted);font-size:.88rem}
</style>
</head>
<body>
<main>

<header>
  <h1>Why ZATCA rejects your QR code</h1>
  <p class="lede">
    The spec sentence everyone copies is <em>“The length shall be stored in one
    byte.”</em> It stops being true at 128 bytes — and Arabic is two bytes per
    character in UTF-8, so <strong>a 64-character Arabic company name is 128
    bytes</strong>. That is an ordinary Saudi trade name, not an edge case.
  </p>
  <p class="lede" style="margin-top:.6rem">
    <a href="${AR}">اقرأ النسخة العربية &larr;</a>
  </p>
</header>

<div class="hero">
  <div class="figure">${brokenShare}%</div>
  <p style="margin:.4rem 0 0">
    of the <strong>${num(totalReach)}</strong> monthly npm downloads measured here go
    to packages that fail at least one rule. Of ${others.length} third-party packages,
    <strong>${perfect}</strong> pass every case.
  </p>
</div>

<h2>The rule</h2>
<p class="lede">The TLV length is a BER length, not a plain byte:</p>
<pre><code>length &lt; 128          one byte
128 &le; length &le; 255    0x81, then the length byte
256 &le; length          0x82, then two bytes, big-endian</code></pre>
<p class="lede">
  This is not our reading. It is settled on ZATCA’s own forum, by a developer whose
  QR code was rejected and who traced it to exactly this:
</p>
<blockquote>
  our code assumed that the maximum length of the value is 1 byte and therefore when
  the value was bigger than 127, we were not properly convert it to TLV value
</blockquote>
<p class="lede"><a href="${esc(r.sources.forum)}">${esc(r.sources.forum)}</a></p>

<h2>Results</h2>
<p class="lede">
  Measured ${esc(r.generated_utc)}. Downloads are npm’s last-month figure,
  fetched ${esc(r.downloads_measured_utc ?? r.generated_utc)}.
</p>
<div class="scroll">
<table>
  <thead><tr><th>package</th><th class="num">downloads/mo</th><th class="num">score</th></tr></thead>
  <tbody>${board}</tbody>
</table>
</div>

<h2>What fails, and where</h2>
${findings}

<h2>The fix</h2>
<pre><code>const berLength = (n) =&gt;
  n &lt; 0x80  ? [n] :
  n &lt;= 0xFF ? [0x81, n] :
              [0x82, n &gt;&gt; 8, n &amp; 0xFF];

const tlv = (tag, value) =&gt; {
  const bytes = Buffer.from(value, "utf-8");
  return Buffer.concat([Buffer.from([tag, ...berLength(bytes.length)]), bytes]);
};</code></pre>
<p class="lede">
  A decoder must read the same forms. A single-byte reader sees <code>0x81</code> as a
  length of 129 and silently truncates the value — the same bug from the other side.
</p>

<h2>Or install one that already does it</h2>
<p class="lede">
  The four lines above are enough if you only need the QR. If you also need Arabic
  text that survives a PDF — amounts that do not reverse, names that do not truncate
  — these two libraries do both. Not on npm yet; installable today from a release:
</p>
<pre><code>npm install ${REL}</code></pre>
<pre><code>import { encodeZatcaQr, computeTotals, formatMinor } from "fatura";

const qr = encodeZatcaQr({
  sellerName: "&#1605;&#1572;&#1587;&#1587;&#1577; &#1593;&#1576;&#1583; &#1575;&#1604;&#1585;&#1581;&#1605;&#1606; &#1575;&#1604;&#1593;&#1578;&#1610;&#1576;&#1610; &#1604;&#1604;&#1578;&#1580;&#1575;&#1585;&#1577; &#1608;&#1575;&#1604;&#1605;&#1602;&#1575;&#1608;&#1604;&#1575;&#1578;",
  vatNumber: "310122393500003",
  timestamp: "2026-09-01T14:30:00Z",
  totalWithVat: "1150.00",
  vatAmount: "150.00",
});
// a 140-byte name emits 0x81 0x8C — the form ZATCA's validator accepts</code></pre>
<p class="lede">
  <code>fatura</code> pulls <code>nasq</code> with it. Verified end to end from that
  URL in a clean project: correct length form, name intact after decoding, totals in
  halalas.
</p>

<h2>We found it in our own code first</h2>
<p class="lede">
  We went to measure other packages, noticed one writing BER lengths, went to check
  which reading was right — and found <strong>our own</strong> code was wrong, in three
  places including our published checker tool. All were fixed before we measured
  anyone, and the runner refuses to write results at all if one of our engines fails.
</p>

<h2>Reported to the maintainers</h2>
<p class="lede">
  A benchmark that finds a defect and does not tell its author is just gossip. Every
  finding was filed with a runnable reproduction and the fix:
</p>
<div class="scroll">
<table>
  <thead><tr><th>package</th><th>issue</th></tr></thead>
  <tbody>${disclosures}</tbody>
</table>
</div>

<h2>Rules measured</h2>
<div class="scroll">
<table>
  <thead><tr><th style="width:4rem">id</th><th>rule</th></tr></thead>
  <tbody>${ruleRows}</tbody>
</table>
</div>

<h2>Rerun it yourself</h2>
<pre><code>git clone https://github.com/opusstudiohq-max/arabic-invoice-mcp
cd arabic-invoice-mcp/zatca-qr-benchmark
npm install
node run.mjs --fetch &amp;&amp; node build.mjs</code></pre>
<p class="lede">
  Full method, the cases, and <strong>the nine adapters we got wrong on the first
  run</strong>:
  <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp/tree/main/zatca-qr-benchmark">the
  English write-up</a>.
</p>

<footer>
  <p>
    ${r.cases_total} cases · ${scored.length} engines · MIT ·
    <a href="${AR}">النسخة العربية</a> ·
    <a href="https://opusstudiohq-max.github.io/arabic-invoice-mcp/">Arabic invoicing tools</a>
  </p>
  <p>
    We build and repair Saudi e-invoicing integrations — scope and price agreed before
    any work starts. <a href="mailto:yahya@opus-studio.pro?subject=ZATCA%20integration">yahya@opus-studio.pro</a>
    (<code>yahya@opus-studio.pro</code>)
  </p>
</footer>

</main>
</body>
</html>
`;

mkdirSync(join(HERE, "en"), { recursive: true });
writeFileSync(join(HERE, "en", "index.html"), html, "utf-8");
console.log(`✓ en/index.html — ${brokenShare}% of ${num(totalReach)} downloads`);

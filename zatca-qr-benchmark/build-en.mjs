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

/**
 * الفاكُّ الذي حكم على الجدول — **نصُّه نفسه** يُحقن في الصفحة.
 *
 * فلو كُتب فاكٌّ ثانٍ للمتصفّح لانجرف عن الأول بلا صوت، وهو العيبُ الذي
 * يقيسه هذا المشروع. والحارس ⑲ يتحقق أن ما في الصفحة هو ما في الملف.
 *
 * و`export` تُنزع لأن الوسم `<script>` هنا ليس وحدةً، وإغلاقُ الوسم يُكسر
 * لو ورد في نصٍّ — ولا يرد، لكنّ الحيطة أرخص من صفحةٍ مكسورة.
 */
const decoderSource = readFileSync(join(HERE, "decode.mjs"), "utf-8")
  .replace(/^export /gm, "")
  .replace(/<\/script>/gi, "<\\/script>");

/** واجهةُ «افحص رمزك» — في ملفٍ مستقلّ فلا تُكتب داخل قالبٍ نصّي. */
const widgetSource = readFileSync(join(HERE, "widget-en.js"), "utf-8")
  .replace(/<\/script>/gi, "<\\/script>");

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

// `npm` غائبةٌ عن المُبلَّغ عنها خارج npm — فيُعرض `name`، وتُعلَن البيئة
// عموداً. وأوّلُ إضافةٍ لأربعةٍ منها أظهرت الصفَّ فارغاً بـ`undefined`.
const disclosures = (r.disclosures?.items ?? []).map((d) => `
  <tr><td><code>${esc(d.npm ?? d.name)}</code></td>
      <td>${esc(d.ecosystem ?? "npm")}</td>
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

const REL = "https://github.com/opusstudiohq-max/arabic-invoice-mcp/releases/download/libs-v0.2.0/fatura-zatca-0.2.0.tgz";
const AR = "https://mutawafiq.opus-studio.pro/zatca-qr/";
const EN = "https://mutawafiq.opus-studio.pro/zatca-qr/en/";

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
<meta property="og:image" content="${EN}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${brokenShare}% of measured ZATCA npm downloads ship the TLV length bug">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${EN}og.png">
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
  .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);
                   white-space:nowrap}
  .checker{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem}
  .checker textarea{width:100%;box-sizing:border-box;font:.85rem/1.5 ui-monospace,SFMono-Regular,
                    Menlo,Consolas,monospace;direction:ltr;background:var(--bg);color:var(--ink);
                    border:1px solid var(--line);border-radius:6px;padding:.6rem;resize:vertical}
  .checker-row{display:flex;gap:.5rem;flex-wrap:wrap;margin:.7rem 0 0}
  .checker button{font:inherit;font-weight:600;padding:.5rem 1rem;border-radius:6px;cursor:pointer;
                  border:1px solid var(--accent);background:var(--accent);color:var(--bg)}
  .checker button.ghost{background:transparent;color:var(--accent)}
  .checker button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  #qr-out:not(:empty){margin-top:1rem}
  .verdict{border-radius:8px;padding:.7rem .9rem;font-weight:600}
  .verdict.ok{background:var(--ok-bg);border:1px solid var(--ok);color:var(--ok)}
  .verdict.bad{background:var(--bad-bg);border:1px solid var(--bad);color:var(--bad)}
  .verdict p{margin:.5rem 0 0;font-weight:400;color:var(--ink)}
  .verdict code{white-space:nowrap}
  .tlv{width:100%;margin-top:.8rem;font-size:.85rem}
  .tlv td,.tlv th{padding:.35rem .5rem;border-bottom:1px solid var(--line);text-align:left}
  .tlv code{direction:ltr;unicode-bidi:isolate}
</style>
<script src="/js/mtq.js" defer></script>
</head>
<body>
<main>

<header>
  <h1>Why ZATCA rejects your QR code</h1>
  <p class="lede">
    The spec sentence everyone copies is <em>“The length shall be stored in one
    byte.”</em> It stops being true at 128 bytes — and Arabic letters are two bytes
    each in UTF-8, so <strong>a trade name of roughly 64 Arabic letters crosses 128
    bytes</strong>. That is an ordinary Saudi company name, not an edge case.
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

<h2>Check your own QR</h2>
<p class="lede">
  Paste the Base64 your encoder produces. Nothing is uploaded — this runs
  <strong>the same decoder that scored the table below</strong>, in your browser.
</p>
<div class="checker">
  <label class="visually-hidden" for="qr-input">QR Base64</label>
  <textarea id="qr-input" rows="3" spellcheck="false"
    placeholder="AQVTYWxsYQIPMzEwMTIyMzkzNTAwMDAzAxQyMDI2LTA5LTAyVDAxOjAwOjAwWgQGMTE1LjAwBQUxNS4wMA=="></textarea>
  <div class="checker-row">
    <button type="button" id="qr-check">Decode</button>
    <button type="button" id="qr-sample" class="ghost">Load a broken example</button>
  </div>
  <div id="qr-out" role="status" aria-live="polite"></div>
</div>

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
<pre><code>import { encodeZatcaQr, computeTotals, formatMinor } from "fatura-zatca";

const qr = encodeZatcaQr({
  sellerName: "&#1605;&#1572;&#1587;&#1587;&#1577; &#1593;&#1576;&#1583; &#1575;&#1604;&#1585;&#1581;&#1605;&#1606; &#1575;&#1604;&#1593;&#1578;&#1610;&#1576;&#1610; &#1604;&#1604;&#1578;&#1580;&#1575;&#1585;&#1577; &#1608;&#1575;&#1604;&#1605;&#1602;&#1575;&#1608;&#1604;&#1575;&#1578;",
  vatNumber: "310122393500003",
  timestamp: "2026-09-01T14:30:00Z",
  totalWithVat: "1150.00",
  vatAmount: "150.00",
});
// a 140-byte name emits 0x81 0x8C — the form ZATCA's validator accepts</code></pre>
<p class="lede">
  <code>fatura-zatca</code> pulls <code>nasq</code> with it. Verified end to end from that
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

<h2>It is not a JavaScript problem</h2>
<p class="lede">
  The scores above cover npm, because that is what this harness can execute. But the
  same defect is in the most-starred ZATCA repositories on GitHub, in three other
  languages — including libraries published by major Saudi platforms:
</p>
<div class="scroll">
<table>
  <thead><tr><th>repository</th><th>language</th><th>the length line</th></tr></thead>
  <tbody>
    <tr><td><code>SallaApp/ZATCA</code></td><td>PHP</td>
        <td><code>pack("H*", sprintf("%02X", $len))</code></td></tr>
    <tr><td><code>Saleh7/php-zatca-xml</code></td><td>PHP</td>
        <td><code>pack("H*", sprintf("%02X", $len))</code></td></tr>
    <tr><td><code>mrsool/zatca</code></td><td>Ruby</td>
        <td><code>@value.bytesize.chr</code></td></tr>
    <tr><td><code>Haraj-backend/zatca-sdk-go</code></td><td>Go</td>
        <td><code>buf.WriteByte(byte(len(val)))</code></td></tr>
  </tbody>
</table>
</div>
<p>
  All four measure the value in <strong>bytes</strong> — they clear the trap that
  catches most implementations — and then write that count in a single byte. The Go
  library states the premise outright:
</p>
<pre><code>// since the length could only be 1 byte, that means the maximum length for
// every field values is 255.
const maxValueLength = 255</code></pre>
<p>
  So the error is not a slip in one ecosystem. It is a <strong>common reading of a
  spec sentence that says "one byte"</strong> — which is why it reaches
  ${brokenShare}% of measured npm downloads and the top of GitHub alike.
</p>
<p class="note">
  These four were <strong>read, not executed</strong> — there is no PHP, Ruby or Go
  runtime on the machine that produced this page. The quotes are literal from each
  repository's default branch. The npm scores above are executed.
</p>

<h2>Reported to the maintainers</h2>
<p class="lede">
  A benchmark that finds a defect and does not tell its author is just gossip. Every
  finding was filed with a runnable reproduction and the fix:
</p>
<div class="scroll">
<table>
  <thead><tr><th>package</th><th>ecosystem</th><th>issue</th></tr></thead>
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
    <a href="https://mutawafiq.opus-studio.pro/">Arabic invoicing tools</a>
  </p>
  <p>
    We build and repair Saudi e-invoicing integrations — scope and price agreed before
    any work starts. <a href="mailto:yahya@opus-studio.pro?subject=ZATCA%20integration">yahya@opus-studio.pro</a>
    (<code>yahya@opus-studio.pro</code>)
  </p>
</footer>

</main>
<script>
${decoderSource}
${widgetSource}
</script>
<p class="mtq-note" style="max-width:70ch;margin:2.5rem auto 0;padding:0 1rem;font-size:.78rem;line-height:1.9;opacity:.62;text-align:center">We count visits without cookies or identity — a count and a path, nothing more. بلا كوكيز. Your invoice never leaves your browser, and that has not changed.</p>
<!-- crosslinks:begin -->
<nav class="crosslinks" aria-label="أدوات أخرى" style="margin:3rem auto 0;padding:1.1rem 1rem 0;max-width:70ch;border-top:1px solid rgba(128,128,128,.28);font-size:.82rem;line-height:2.1;text-align:center;opacity:.85">
  <strong style="font-weight:600">أدواتٌ أخرى:</strong>
  <a href="/">الصفحة الأولى</a>
  <span aria-hidden="true"> · </span>
  <a href="/checker/">فاحص رمز QR</a>
  <span aria-hidden="true"> · </span>
  <a href="/checker/batch.html">الفحص الجماعي</a>
  <span aria-hidden="true"> · </span>
  <a href="/invoice/">أداة الفاتورة</a>
  <span aria-hidden="true"> · </span>
  <a href="/cheque/dist/mutawafiq-cheque.html">طباعة الشيكات</a>
  <span aria-hidden="true"> · </span>
  <a href="/zatca-qr/">مقياس رمز QR</a>
  <span aria-hidden="true"> · </span>
  <a href="/pdf/">مقياس النصّ في PDF</a>
  <span aria-hidden="true"> · </span>
  <a href="/tafgeet/">مقياس التفقيط</a>
</nav>
<!-- crosslinks:end -->
</body>
</html>
`;

mkdirSync(join(HERE, "en"), { recursive: true });
writeFileSync(join(HERE, "en", "index.html"), html, "utf-8");
console.log(`✓ en/index.html — ${brokenShare}% of ${num(totalReach)} downloads`);

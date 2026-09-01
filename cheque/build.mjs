/**
 * بناء نسخة الملف الواحد.
 *
 * لماذا: الوعد البيعي هو «لا يحتاج تثبيت». ووحدات ES لا تعمل من `file://`
 * بسبب سياسة CORS، فالمستخدم الذي ينقر نقرتين على index.html يرى صفحة ميتة.
 * هذا السكربت يدمج الوحدات الثلاث داخل `<script>` واحد فيعمل الملف بالنقر
 * المزدوج، بلا خادم وبلا إنترنت.
 *
 * التشغيل:  node cheque-tool/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "dist");
const OUT = join(OUT_DIR, "mutawafiq-cheque.html");

const read = (p) => readFileSync(join(HERE, p), "utf-8");
/**
 * صفحةُ المصدر تحمل `noindex` لأنها منشورةٌ ومكسورة (سكربتها وحدةُ ES
 * باستيراداتٍ مجرّدة). والمخرَج هو **الأداة الحقيقية**، فيُنزع منه المنع
 * وإلا أُخرجت الأداةُ نفسها من الفهرسة.
 */
const dropNoindex = (html) => html
  .replace(/<!--[^]*?صفحة المصدر[^]*?-->\s*/g, "")
  .replace(/<meta name="robots" content="noindex">\s*/g, "")
  .replace(/<link rel="canonical"[^>]*>\s*/g, "");

/** يجرّد `import`/`export` ليصلح الوحدات للدمج في نطاق واحد. */
function flatten(src) {
  return src
    .replace(/^\s*import[^;]+;\s*$/gm, "")
    .replace(/^export\s+(const|function|let|class)\s/gm, "$1 ")
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "");
}

const parts = ["js/tafgeet.js", "js/layouts.js", "js/app.js"].map(read).map(flatten);

let html = dropNoindex(read("index.html"));
html = html.replace(
  /<script type="module" src="js\/app\.js"><\/script>/,
  `<script>\n"use strict";\n(function(){\n${parts.join("\n\n")}\n})();\n</script>`
);

// وسم النسخة المدمجة صراحةً حتى لا تختلط بنسخة التطوير
html = html.replace(
  "</head>",
  `<meta name="build" content="single-file">\n</head>`
);

if (/type="module"|from ['"]\.\//.test(html)) {
  console.error("✖ بقيت وحدات غير مدموجة — الملف لن يعمل من file://");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html, "utf-8");
const kb = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1);
console.log(`✓ ${OUT}  (${kb} KB، ملف واحد، يعمل بالنقر المزدوج)`);

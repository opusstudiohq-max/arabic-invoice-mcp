/**
 * بناء الأداة: يدمج القطع في ملف واحد يعمل في المتصفّح.
 *
 * القطع مبنيّة ومُختبَرة على حدة (نَسْق، فاتورة، مُتوافِق)، وهذا السكربت
 * يجمعها لا غير — فلا منطقَ هنا يفلت من اختبار.
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "dist");
mkdirSync(join(OUT, "fonts"), { recursive: true });

const result = await build({
  entryPoints: [join(HERE, "src", "app.js")],
  bundle: true,
  format: "esm",
  target: ["es2020"],
  minify: true,
  outfile: join(OUT, "app.js"),
  legalComments: "none",
  logLevel: "warning",
});
if (result.errors.length) process.exit(1);

/**
 * نسخٌ لا يُخفق على ملفٍ مقفول.
 *
 * أخفق البناء أول مرّة لأن خادم المعاينة كان يمسك الخطّ. والملف الثابت لا
 * يحتاج نسخاً أصلاً إن لم يتغيّر — فيُقارَن حجمه أولاً.
 */
function place(from, to) {
  if (existsSync(to) && statSync(to).size === statSync(from).size) return;
  copyFileSync(from, to);
}

// الخطّ ورخصته — OFL تشترط مرافقة الرخصة
for (const f of ["Almarai.ttf", "OFL.txt"]) {
  place(join(HERE, "fonts", f), join(OUT, "fonts", f));
}
copyFileSync(join(HERE, "index.html"), join(OUT, "index.html"));
copyFileSync(join(HERE, "style.css"), join(OUT, "style.css"));

const kb = (p) => (statSync(p).size / 1024).toFixed(1);
console.log(`✓ dist/app.js       ${kb(join(OUT, "app.js"))} KB`);
console.log(`✓ dist/fonts/       ${kb(join(OUT, "fonts", "Almarai.ttf"))} KB (Almarai، OFL)`);

// حارس: لا يبقى استيرادٌ غير مدموج، وإلا ماتت الصفحة عند المستعمل
const bundled = readFileSync(join(OUT, "app.js"), "utf-8");
if (/from\s*["']\.\.?\//.test(bundled)) {
  console.error("✖ بقي استيراد نسبي غير مدموج");
  process.exit(1);
}
writeFileSync(join(OUT, ".nojekyll"), "");

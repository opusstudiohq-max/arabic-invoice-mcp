/**
 * جلب ملفات قاعدة بيانات محارف يونيكود اللازمة لسلسلة المطابقة.
 *
 * تُجلب **مرّة وتُخزَّن** ولا تُودَع في المستودع: نحو ١٥ ميغابايت من بيانات
 * طرفٍ آخر، ونسخُها عندنا يعني نسختين تتباعدان — وقاعدتنا أن ما ليس لنا
 * يُجلب ويُخزَّن لا يُحفظ.
 *
 *   node arabic-text/fetch-ucd.mjs
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const BASE = "https://www.unicode.org/Public/UCD/latest/ucd/";

/** ما نحتاجه فعلاً — لا أكثر. */
export const FILES = [
  "BidiCharacterTest.txt",   // ٩١٬٧٠٧ حالة بمحارف حقيقية ومستوياتها وترتيبها
  "BidiTest.txt",            // حالات مُولَّدة بأصناف الاتجاه
  "BidiMirroring.txt",       // المحارف المتناظرة (قاعدة L4)
  "BidiBrackets.txt",        // أزواج الأقواس (قواعد BD14–BD16)
  "extracted/DerivedJoiningType.txt", // أصناف الوصل — يوصي بها يونيكود صراحةً
];

export function pathFor(name) {
  return join(DATA, name.split("/").pop());
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  for (const name of FILES) {
    const target = pathFor(name);
    if (existsSync(target)) {
      console.log(`• ${name.padEnd(38)} موجود (${statSync(target).size.toLocaleString()} بايت)`);
      continue;
    }
    const res = await fetch(BASE + name, {
      headers: { "User-Agent": "OpusStudio/nasq (+opus.studio.hq@gmail.com)" },
    });
    if (!res.ok) { console.error(`✖ ${name}: HTTP ${res.status}`); process.exitCode = 1; continue; }
    const body = Buffer.from(await res.arrayBuffer());
    writeFileSync(target, body);
    console.log(`✓ ${name.padEnd(38)} ${body.length.toLocaleString()} بايت`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fetch-ucd.mjs")) {
  await main();
}

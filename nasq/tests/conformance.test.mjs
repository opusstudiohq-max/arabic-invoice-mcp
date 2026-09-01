/**
 * سلسلة المطابقة الرسمية — **حارسٌ على تبعيتنا لا على كودنا**.
 *
 * قرارُنا الهندسي أن نبني على `bidi-js` بدل كتابة UAX #9 من جديد. وقرارٌ
 * كهذا لا يُتَّخذ بالرأي: شغّلنا الحزمة على `BidiCharacterTest.txt` —
 * ٩١٬٧٠٧ حالة بمحارف حقيقية، من يونيكود نفسها — فاجتازتها كلها.
 *
 *   مستوى الفقرة   ٩١٬٧٠٧/٩١٬٧٠٧
 *   المستويات      ٩١٬٧٠٧/٩١٬٧٠٧
 *   الترتيب البصري ٩١٬٧٠٧/٩١٬٧٠٧
 *
 * ويبقى هذا الاختبار قائماً لأن الحارس ليس على صحّة الحزمة يوم قِسناها،
 * بل على بقائها صحيحة بعد كل ترقية. وإن سقطت يوماً، سقط معها أساس القرار
 * لا فرعٌ منه.
 *
 * البيانات تُجلب ولا تُودَع:  node arabic-text/fetch-ucd.mjs
 *
 *   node --test arabic-text/tests/conformance.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "..", "data", "BidiCharacterTest.txt");
const missing = existsSync(FILE) ? false : "البيانات غير مجلوبة — شغّل fetch-ucd.mjs";

/**
 * صيغة السطر:  المحارف ; اتجاه الفقرة ; مستواها ; المستويات ; الترتيب
 * و`x` في حقل المستويات تعني محرفاً يُحذف من المخرَج (قاعدة X9).
 */
function* cases() {
  for (const line of readFileSync(FILE, "utf-8").split("\n")) {
    if (!line || line[0] === "#") continue;
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const [hex, dir, paragraphLevel, levels, order] = parts;
    yield {
      text: hex.trim().split(/\s+/).map((h) => String.fromCodePoint(parseInt(h, 16))).join(""),
      base: { 0: "ltr", 1: "rtl" }[dir.trim()],
      paragraphLevel: Number(paragraphLevel),
      levels: levels.trim().split(/\s+/),
      order: order.trim() ? order.trim().split(/\s+/).map(Number) : [],
      line,
    };
  }
}

/** مؤشر كل نقطة ترميز داخل السلسلة — النمذجة بوحدات UTF-16 تكسر ما فوق BMP. */
function codePointOffsets(text) {
  const offsets = [];
  let at = 0;
  for (const ch of text) { offsets.push(at); at += ch.length; }
  return offsets;
}

test("جداول يونيكود مجلوبة", { skip: missing }, () => {
  assert.ok(readFileSync(FILE, "utf-8").includes("BidiCharacterTest"));
});

test("bidi-js يطابق سلسلة يونيكود في مستوى الفقرة والمستويات والترتيب", { skip: missing }, () => {
  let total = 0;
  const failures = { paragraph: [], levels: [], order: [] };

  for (const c of cases()) {
    total++;
    const embedding = bidi.getEmbeddingLevels(c.text, c.base);
    const offsets = codePointOffsets(c.text);

    if (embedding.paragraphs[0].level !== c.paragraphLevel && failures.paragraph.length < 3) {
      failures.paragraph.push(c.line.slice(0, 90));
    }

    let levelsOk = c.levels.length === offsets.length;
    if (levelsOk) {
      for (let i = 0; i < offsets.length; i++) {
        if (c.levels[i] === "x") continue;                    // مَحذوف بقاعدة X9
        if (embedding.levels[offsets[i]] !== Number(c.levels[i])) { levelsOk = false; break; }
      }
    }
    if (!levelsOk && failures.levels.length < 3) failures.levels.push(c.line.slice(0, 90));

    const got = bidi
      .getReorderedIndices(c.text, embedding)
      .filter((i) => offsets.includes(i))
      .map((i) => offsets.indexOf(i))
      .filter((i) => c.levels[i] !== "x");
    const orderOk = got.length === c.order.length && got.every((v, k) => v === c.order[k]);
    if (!orderOk && failures.order.length < 3) failures.order.push(c.line.slice(0, 90));
  }

  assert.ok(total > 90000, `عدد الحالات ${total} أقل من المتوقَّع — هل الملف مبتور؟`);
  assert.deepEqual(failures.paragraph, [], "أخفق في مستوى الفقرة");
  assert.deepEqual(failures.levels, [], "أخفق في المستويات الاتجاهية");
  assert.deepEqual(failures.order, [], "أخفق في الترتيب البصري");
});

/**
 * فجوة معروفة ومقيسة في التبعية، تُثبَّت ولا تُخفى.
 *
 * جدول `bidi-js` مبنيّ على إصدار يونيكود أقدم من ١٧، فتنقصه **ثمانية**
 * أزواج من أصل ٤٢٨ — كلها في الكتلة المتّصلة U+2E55..U+2E5C (الأقواس
 * المزدوجة، أُضيفت في يونيكود ١٤ للترميز اللغوي المتخصّص). ولا واحدة منها
 * تظهر في مستند تجاري، وكل الأقواس والعلامات الشائعة سليمة، و**صفر** قلبٍ
 * خاطئ.
 *
 * فالاختبار يُثبّت الفجوة بحدّها: أي اتساع — سقوط قوسٍ شائع في ترقية
 * قادمة مثلاً — يُفشله. وحذفُ الاختبار كان سيُخفي الحدّ مع الفجوة.
 */
test("قلب المحارف المتناظرة: لا خطأ، والنقص محصور فيما قِسناه", { skip: missing }, () => {
  const file = join(HERE, "..", "data", "BidiMirroring.txt");
  if (!existsSync(file)) return;

  const KNOWN_MISSING = new Set([0x2e55, 0x2e56, 0x2e57, 0x2e58, 0x2e59, 0x2e5a, 0x2e5b, 0x2e5c]);
  const wrong = [], unexpectedlyMissing = [];
  let pairs = 0;

  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([0-9A-F]{4,6});\s*([0-9A-F]{4,6})/);
    if (!m) continue;
    pairs++;
    const code = parseInt(m[1], 16);
    const got = bidi.getMirroredCharacter(String.fromCodePoint(code));
    if (got == null) {
      if (!KNOWN_MISSING.has(code)) unexpectedlyMissing.push(`U+${m[1]}`);
    } else if (got !== String.fromCodePoint(parseInt(m[2], 16))) {
      wrong.push(`U+${m[1]} ⇒ توقّعنا U+${m[2]} فوجدنا U+${got.codePointAt(0).toString(16).toUpperCase()}`);
    }
  }

  assert.ok(pairs > 400, `عدد الأزواج ${pairs} أقل من المتوقَّع`);
  assert.deepEqual(wrong, [], "قلبٌ خاطئ — وهذا أخطر من النقص، فهو يرسم العلامة معكوسة");
  assert.deepEqual(unexpectedlyMissing, [],
    "اتّسع النقص عمّا قِسناه — راجع إصدار bidi-js قبل تحديث القائمة");
});

test("كل قوس أو علامة تظهر في مستند تجاري لها نظير", { skip: missing }, () => {
  const everyday = "()[]{}<>«»‹›";
  const without = [...everyday].filter((c) => !bidi.getMirroredCharacter(c));
  assert.deepEqual(without, [], "علامة شائعة بلا نظير — ستُرسم في اتجاهها الخاطئ داخل نصّ عربي");
});

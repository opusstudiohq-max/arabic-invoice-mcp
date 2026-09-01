/**
 * تقسيم النصّ إلى **مقاطع اتجاهية** بترتيبها البصري.
 *
 * ### لماذا هذا الملف موجود
 *
 * مكتبات PDF في جافاسكربت تُشكّل العربية تشكيلاً صحيحاً — `fontkit` تحمل
 * محرّك OpenType كاملاً — ثم **تعكس السلسلة كلها** لأنها رأت نصّاً من
 * اليمين إلى اليسار. فينعكس معها الرقمُ الذي بداخلها.
 *
 * والنتيجة مقيسة، لا مُستنتَجة: `الإجمالي 1,234.50 ج.م` يُطبع في الملف
 * `م.ج 05.432,1 ﻲﻟﺎﻣﺟﻹا` — أي أن **المبلغ يظهر للعميل «05.432,1»**.
 *
 * ### ولماذا لا يُصلحه إضافةُ خوارزمية ثنائية الاتجاه وحدها
 *
 * لأن العكس يقع **مرّتين**: مرّة منك ومرّة من المكتبة. وقد قِسنا ذلك على
 * حزمتين منشورتين تُخرجان النصّ صحيحاً وحدهما، فلمّا مرّ ناتجهما بـ
 * `pdf-lib.drawText` عاد الرقم مقلوباً **وانكسر معه شكلُ الحروف** — إذ
 * تُشكَّل الحروف حينئذ على جوارٍ مقلوب، فتنشأ وصلات لا وجود لها في الأصل.
 * الإصلاح الساذج أسوأ من تركه.
 *
 * ### الترتيب الصحيح
 *
 * ①  المستويات الاتجاهية للنصّ كاملاً (UAX #9)
 * ②  قطعُه إلى مقاطع كلٌّ منها ذو اتجاه واحد
 * ③  **قلب الأقواس** في المقاطع اليمينية (قاعدة L4)
 * ④  تشكيل كل مقطع وحده بترتيبه المنطقي وباتجاهه هو
 * ⑤  رصف المقاطع في مواضعها
 *
 * فالعكس يبقى واحداً: تعكسه المكتبة داخل المقطع اليميني، وذلك صواب.
 * أمّا المقطع الرقمي فمقطعٌ يساري مستقلّ، لا تمسّه.
 */
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/** اتجاه الفقرة. `auto` يستنبطه من أول محرف قويّ (قاعدة P2). */
export type BaseDirection = "rtl" | "ltr" | "auto";

/** مقطعٌ ذو اتجاه واحد، جاهزٌ للرسم في موضعه من اليسار إلى اليمين. */
export interface DirectionalRun {
  /** نصّ المقطع بترتيبه **المنطقي** — تتولّى أداةُ التشكيل عكسَه إن لزم. */
  text: string;
  /** أمن اليمين إلى اليسار؟ (مستوى فردي في UAX #9) */
  rtl: boolean;
  /** المستوى الاتجاهي المُحلّ. */
  level: number;
}

/**
 * قلب الأقواس والعلامات المتناظرة داخل مقطع يميني — قاعدة L4 من UAX #9.
 *
 * `(نقداً)` بلا قلب تُطبع بقوسين معكوسين: يبدو النصّ محاطاً بـ`)…(`.
 */
export function mirror(text: string): string {
  let out = "";
  for (const ch of text) out += bidi.getMirroredCharacter(ch) ?? ch;
  return out;
}

/**
 * المقاطع الاتجاهية بترتيبها **البصري** — الأيسر أولاً.
 *
 * ارسم المقاطع بهذا الترتيب، كلَّ واحدٍ عند نهاية سابقه، تحصل على السطر
 * صحيحاً.
 *
 * @param text نصّ بترتيبه المنطقي كما كتبه المستعمل
 * @param base اتجاه الفقرة — `auto` هو استنباط UAX #9 لا تخمينٌ منّا
 */
export function resolveRuns(text: string, base: BaseDirection = "auto"): DirectionalRun[] {
  if (text === "") return [];
  const embedding = bidi.getEmbeddingLevels(text, base === "auto" ? undefined : base);
  const levels = embedding.levels;
  const visual = bidi.getReorderedIndices(text, embedding);

  // نجمع المواضع البصرية المتتالية التي تنتمي إلى المستوى نفسه **وتتجاور
  // منطقياً**. المقطع اليميني تتنازل مؤشراته، واليساري تتصاعد.
  type Partial = { level: number; lo: number; hi: number; expect: number };
  const groups: Partial[] = [];
  for (const logical of visual) {
    const level = levels[logical];
    const last = groups[groups.length - 1];
    const step = level & 1 ? -1 : 1;
    if (last && last.level === level && logical === last.expect) {
      last.lo = Math.min(last.lo, logical);
      last.hi = Math.max(last.hi, logical);
      last.expect += step;
    } else {
      groups.push({ level, lo: logical, hi: logical, expect: logical + step });
    }
  }

  return groups.map((g) => {
    const rtl = !!(g.level & 1);
    const slice = text.slice(g.lo, g.hi + 1);
    return { text: rtl ? mirror(slice) : slice, rtl, level: g.level };
  });
}

/**
 * اتجاه الفقرة كما يُحلّه UAX #9 (قاعدة P2/P3).
 *
 * يفيد في محاذاة السطر: الفقرة اليمينية تُحاذى يميناً.
 */
export function paragraphDirection(text: string, base: BaseDirection = "auto"): "rtl" | "ltr" {
  const embedding = bidi.getEmbeddingLevels(text, base === "auto" ? undefined : base);
  return embedding.paragraphs[0]?.level & 1 ? "rtl" : "ltr";
}

/** إصدار يونيكود الذي بُنيت عليه جداول `bidi-js` المُعتمَدة. */
export { default as _bidiFactory } from "bidi-js";

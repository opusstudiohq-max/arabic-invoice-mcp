/**
 * تصريح أنواع لـ`bidi-js` — الحزمة تشحن جافاسكربت بلا أنواع.
 *
 * ونحن نصف **ما نستعمله فقط**، لا الواجهة كلها: تصريحٌ أوسع من الاستعمال
 * يدّعي معرفةً لم تُختبر، وأول تغيير في المنبع يُكذّبه بصمت. وسلامةُ ما
 * هنا مضمونة بسلسلة المطابقة في `tests/conformance.test.mjs`، لا بالتصريح.
 */
declare module "bidi-js" {
  export interface EmbeddingLevels {
    /** المستوى الاتجاهي المُحلّ لكل وحدة UTF-16. */
    levels: Uint8Array;
    /** الفقرات وحدودها ومستوى كلٍّ منها (قاعدة P1). */
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  export interface Bidi {
    /** تحليل UAX #9 كاملاً. `baseDirection` غير مُمرَّرة ⇒ استنباط P2/P3. */
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl"): EmbeddingLevels;
    /** المؤشرات المنطقية مرتّبةً بصرياً — الأيسر أولاً (قاعدة L2). */
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[];
    /** النصّ بترتيبه البصري. */
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    /** المقاطع التي يجب قلبها لتحقيق الترتيب البصري. */
    getReorderSegments(text: string, embeddingLevels: EmbeddingLevels): Array<[number, number]>;
    /** نظير المحرف المتناظر (قاعدة L4)، أو `null` إن لم يكن له نظير. */
    getMirroredCharacter(char: string): string | null;
  }

  export default function bidiFactory(): Bidi;
}

/**
 * رسم نصّ عربي صحيح على صفحة `pdf-lib`.
 *
 * يستعمل الواجهة العامة وحدها — لا مساس بدواخل المكتبة — فالفكرة كلها أن
 * `drawText` **صحيحة داخل المقطع الواحد**: تُشكّل حروفه وتعكسها، وذلك
 * تماماً ما يلزم. خطؤها أنها تعامل السطر المختلط بوصفه مقطعاً واحداً.
 * فنحن نقطع، وهي تُتقن ما تُتقن.
 *
 * ```ts
 * import { drawArabicText } from "nasq/pdf-lib";
 * drawArabicText(page, "الإجمالي 1,234.50 ج.م", { font, size: 12, x: 550, y: 700 });
 * ```
 */
import type { PDFPage, PDFFont, Color } from "pdf-lib";
import { resolveRuns, paragraphDirection, type BaseDirection, type DirectionalRun } from "./runs.js";

/**
 * الخطّ: واحدٌ للسطر كله، أو دالّةٌ تختاره **لكل مقطع**.
 *
 * والاختيار لكل مقطع ليس ترفاً: كثيرٌ من الخطوط العربية المرخَّصة بحرية لا
 * تحمل الحروف اللاتينية ولا الأقواس ولا علامة النسبة — قِسنا Noto Sans
 * Arabic فوجدناه يغطي 1,161 محرفاً، فيها الأرقام وليس فيها `(` ولا `%` ولا
 * `A`. وسطرٌ يُرسم بخطٍّ لا يحمل محرفه يخرج **فارغاً بلا شكوى**.
 */
export type FontChoice = PDFFont | ((run: DirectionalRun) => PDFFont);

export interface DrawOptions {
  /** خطّ مُضمَّن يحمل الحروف العربية، أو دالّة تختاره لكل مقطع. */
  font: FontChoice;
  size: number;
  /** موضع السطر أفقياً: حافته اليمنى إن كانت المحاذاة `right`. */
  x: number;
  /** خطّ الأساس. */
  y: number;
  color?: Color;
  /** `auto` (المبدئي) يُحاذي حسب اتجاه الفقرة المُحلّ. */
  align?: "right" | "left" | "auto";
  /** اتجاه الفقرة — `auto` يستنبطه UAX #9 من أول محرف قويّ. */
  base?: BaseDirection;
}

/**
 * عرض النصّ بعد الترتيب الصحيح.
 *
 * ⚠️ لا يساوي `font.widthOfTextAtSize(text)` دائماً: الوصلات الواجبة
 * (لا، لأ) تدمج محرفين في رسمٍ واحد، وقياسُ السلسلة كاملةً يمرّ بمسار
 * تشكيلٍ آخر. القياس هنا هو مجموع عروض المقاطع كما سترسم فعلاً.
 */
export function measureArabicText(
  text: string,
  font: FontChoice,
  size: number,
  base: BaseDirection = "auto",
): number {
  let total = 0;
  for (const run of resolveRuns(text, base)) total += pick(font, run).widthOfTextAtSize(run.text, size);
  return total;
}

/** الخطّ لهذا المقطع — واحدٌ للجميع أو اختيارٌ لكل مقطع. */
function pick(font: FontChoice, run: DirectionalRun): PDFFont {
  return typeof font === "function" ? font(run) : font;
}

/**
 * يرسم السطر ويُعيد عرضه.
 *
 * كل مقطع يُرسم وحده عند نهاية سابقه، فيبقى العكس واحداً داخل المقطع
 * اليميني ولا يمسّ المقطعَ الرقمي.
 */
export function drawArabicText(page: PDFPage, text: string, options: DrawOptions): number {
  const { font, size, y, color, base = "auto" } = options;
  const runs = resolveRuns(text, base);
  const width = runs.reduce((sum, r) => sum + pick(font, r).widthOfTextAtSize(r.text, size), 0);

  const align = options.align ?? "auto";
  const rightAligned = align === "right" || (align === "auto" && paragraphDirection(text, base) === "rtl");
  let cursor = rightAligned ? options.x - width : options.x;

  for (const run of runs) {
    const chosen = pick(font, run);
    page.drawText(run.text, { x: cursor, y, size, font: chosen, ...(color ? { color } : {}) });
    cursor += chosen.widthOfTextAtSize(run.text, size);
  }
  return width;
}

/**
 * يكسر النصّ إلى أسطر لا يتجاوز عرضُها `maxWidth`، ثم يرسمها.
 *
 * الكسر عند المسافات في الترتيب **المنطقي** — فالكلمة وحدة معنى لا وحدة
 * عرض، وكسرُها على الترتيب البصري يقطعها في غير موضعها.
 *
 * @returns عدد الأسطر المرسومة
 */
export function drawArabicParagraph(
  page: PDFPage,
  text: string,
  options: DrawOptions & { maxWidth: number; lineHeight?: number },
): number {
  const { font, size, maxWidth, base = "auto" } = options;
  const lineHeight = options.lineHeight ?? size * 1.6;

  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measureArabicText(candidate, font, size, base) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  lines.forEach((line, i) =>
    drawArabicText(page, line, { ...options, y: options.y - i * lineHeight }),
  );
  return lines.length;
}

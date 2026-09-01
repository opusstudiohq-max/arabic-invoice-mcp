/**
 * محرّك التفقيط العربي — نسخة TypeScript.
 *
 * ⚠️ **تاريخ هذا الملف مهم:** كانت نسخة TypeScript السابقة **مبسّطة**، فأخفقت
 * في **31 من 50** حالة في `tafgeet-benchmark` (38%) — بينما محرّك بايثون
 * المرجعي يجتاز 50/50. أي أن حزمتنا المنشورة كانت أفضل من أضعف منافس بـ16
 * نقطة فقط، ونحن على وشك نشر مقياسٍ للصحّة النحوية.
 *
 * ما كان ناقصاً: جداول التذكير والتأنيث، وإسقاط النون عند الإضافة، وقاعدة
 * «التمييز يتبع آخر عدد معطوف»، وجموع التكسير الصحيحة («دنانير» لا
 * «دينارات»)، والحساب العشري الدقيق.
 *
 * هذا الملف **منقول عن نسخة بايثون المرجعية** (176 اختباراً)، ويحرسه
 * `tests/parity.test.mjs` و`tafgeet-benchmark/run.mjs`.
 */

const ONES_M = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة",
  "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر",
  "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر",
  "تسعة عشر",
];

const ONES_F = [
  "", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع",
  "ثماني", "تسع", "عشر", "إحدى عشرة", "اثنتا عشرة", "ثلاث عشرة",
  "أربع عشرة", "خمس عشرة", "ست عشرة", "سبع عشرة", "ثماني عشرة",
  "تسع عشرة",
];

const TENS = [
  "", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون",
  "سبعون", "ثمانون", "تسعون",
];

const HUNDREDS = [
  "", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
  "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
];

const SCALES: Array<[number, string]> = [
  [1, ""], [1000, "ألف"], [1000000, "مليون"],
  [1000000000, "مليار"], [1000000000000, "تريليون"],
];

const SCALE_PLURALS: Record<string, string> = {
  "ألف": "آلاف", "مليون": "ملايين", "مليار": "مليارات", "تريليون": "تريليونات",
};

const IDAFA_DUALS: Array<[string, string]> = [
  ["مئتان", "مئتا"], ["ألفان", "ألفا"], ["مليونان", "مليونا"],
  ["ملياران", "مليارا"], ["تريليونان", "تريليونا"],
];

export interface CurrencyUnit {
  singular: string;
  dual: string;
  plural: string;
  fraction_singular: string;
  fraction_plural: string;
  decimals: number;
  name: string;
}

export const CURRENCY_UNITS: Record<string, CurrencyUnit> = {
  SAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "هللة", fraction_plural: "هللات", decimals: 2, name: "ريال سعودي" },
  EGP: { singular: "جنيه", dual: "جنيهان", plural: "جنيهات", fraction_singular: "قرش", fraction_plural: "قروش", decimals: 2, name: "جنيه مصري" },
  AED: { singular: "درهم", dual: "درهمان", plural: "دراهم", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 2, name: "درهم إماراتي" },
  USD: { singular: "دولار", dual: "دولاران", plural: "دولارات", fraction_singular: "سنت", fraction_plural: "سنتات", decimals: 2, name: "دولار أمريكي" },
  // جمع التكسير الصحيح «دنانير» — النسخة السابقة كانت تقول «دينارات»
  KWD: { singular: "دينار", dual: "ديناران", plural: "دنانير", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 3, name: "دينار كويتي" },
  BHD: { singular: "دينار", dual: "ديناران", plural: "دنانير", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 3, name: "دينار بحريني" },
  OMR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "بيسة", fraction_plural: "بيسات", decimals: 3, name: "ريال عُماني" },
  QAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "درهم", fraction_plural: "دراهم", decimals: 2, name: "ريال قطري" },
};

/** الدينار الكويتي والبحريني والريال العُماني ثلاث منازل (1000 وحدة فرعية). */
export const CURRENCY_DECIMALS: Record<string, number> = Object.fromEntries(
  Object.entries(CURRENCY_UNITS).map(([k, v]) => [k, v.decimals])
);

// ── الحساب العشري الدقيق ────────────────────────────────────────────────
/**
 * تقسيم المبلغ إلى (صحيح، كسر) **بحساب نصّي لا عائم**.
 * `(1250.75 - 1250) * 100` تساوي 74.99999999999997، و`(1.005).toFixed(2)`
 * تعطي "1.00". وفي مستند مالي لا يجوز أن يضيع قرش.
 */
function splitDecimal(value: number | string, decimals: number): {
  integerPart: number; decimalPart: number; negative: boolean;
} {
  let s = typeof value === "string" ? value.trim() : String(value);
  if (/e/i.test(s)) s = Number(s).toFixed(Math.max(decimals + 2, 20));

  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);

  const parts = s.split(".");
  let intStr = (parts[0] || "0").replace(/^0+(?=\d)/, "") || "0";
  const fracStr = parts[1] || "";

  let keep = fracStr.slice(0, decimals).padEnd(decimals, "0");
  const nextDigit = fracStr.charAt(decimals);
  if (nextDigit && nextDigit >= "5") {
    let carried = (BigInt(intStr + (keep || "0")) + 1n).toString();
    const width = intStr.length + decimals;
    carried = carried.padStart(width, "0");
    intStr = carried.slice(0, carried.length - decimals) || "0";
    keep = decimals ? carried.slice(carried.length - decimals) : "";
  }

  return {
    integerPart: Number(intStr),
    decimalPart: decimals ? Number(keep) : 0,
    negative,
  };
}

// ── تحويل الأعداد ───────────────────────────────────────────────────────
function convertHundreds(n: number, gender: "M" | "F" = "M"): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const h = Math.trunc(n / 100);
  const remainder = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push((gender === "M" ? ONES_M : ONES_F)[remainder]);
    } else {
      const t = Math.trunc(remainder / 10);
      const o = remainder % 10;
      if (o > 0) {
        let onesWord: string;
        if (o === 1) onesWord = gender === "M" ? "واحد" : "إحدى";
        else if (o === 2) onesWord = gender === "M" ? "اثنان" : "اثنتان";
        else onesWord = (gender === "M" ? ONES_M : ONES_F)[o];
        parts.push(`${onesWord} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }
  return parts.join(" و");
}

function convertLessThanThousand(
  n: number, scaleWord: string, scaleValue: number, gender: "M" | "F" = "M"
): string {
  if (n === 0) return "";
  const grpGender: "M" | "F" = scaleValue === 1 ? gender : "M";
  let base = convertHundreds(n, grpGender);
  if (scaleValue === 1) return base;
  if (base === "مئتان") base = "مئتا";            // مئتا ألف — إسقاط النون بالإضافة
  if (n === 1) return scaleWord;
  if (n === 2) return `${scaleWord}ان`;
  if (n >= 3 && n <= 10) return `${base} ${SCALE_PLURALS[scaleWord] || scaleWord + "ات"}`;
  return `${base} ${scaleWord}`;
}

/**
 * تحويل رقم إلى كلمات عربية — بجزئه الصحيح وكسره.
 *
 * الكسر مقصود ومطابق للمرجع: `numberToArabicWords(-123.45)` ⇒
 * «سالب مائة وثلاثة وعشرون وخمسة وأربعون». وقد أسقطتُه في أول نقل فانكسر
 * اختبار قائم — وهذا سبب وجود الاختبار.
 */
export function numberToArabicWords(
  n: number, gender: "M" | "F" = "M", decimals: number = 2
): string {
  if (typeof n !== "number" || !isFinite(n)) {
    throw new Error("الرقم يجب أن يكون قيمة عددية محددة");
  }
  if (n === 0) return "صفر";
  const isNegative = n < 0;
  const abs = Math.abs(n);
  let num = Math.trunc(abs);

  let words: string;
  if (num === 0) {
    words = "صفر";
  } else {
    const groups: string[] = [];
    let scaleIdx = 0;
    while (num > 0 && scaleIdx < SCALES.length) {
      const group = num % 1000;
      if (group > 0) {
        const [scaleValue, scaleWord] = SCALES[scaleIdx];
        groups.push(convertLessThanThousand(group, scaleWord, scaleValue, gender));
      }
      num = Math.trunc(num / 1000);
      scaleIdx += 1;
    }
    groups.reverse();
    words = groups.filter(Boolean).join(" و");
  }

  const { decimalPart } = splitDecimal(abs, decimals);
  if (decimalPart > 0) {
    words = `${words} و${convertHundreds(decimalPart, gender)}`;
  }
  return isNegative ? `سالب ${words}` : words;
}

// ── قواعد العملة ────────────────────────────────────────────────────────
/** التاء المربوطة تدل على النصب فلا تُنوَّن؛ وغيرها يُنوَّن بالفتح. */
function accusativeForm(word: string): string {
  return word.endsWith("ة") ? word : word + "اً";
}

/** إسقاط النون من المثنى عند الإضافة: ألفان → ألفا. */
function adjustDualsForIdafa(words: string): string {
  for (const [dual, idafa] of IDAFA_DUALS) {
    if (words.endsWith(dual)) return words.slice(0, -dual.length) + idafa;
  }
  return words;
}

/** بناء المثنى من المفرد: هللة → هللتان، فلس → فلسان. */
function buildDual(singular: string, gender: "M" | "F"): string {
  return gender === "F" ? singular.slice(0, -1) + "تان" : singular + "ان";
}

function currencyGrammar(
  count: number, words: string, singular: string,
  dual: string, plural: string, gender: "M" | "F"
): string {
  if (count === 1) return `${singular} ${gender === "F" ? "واحدة" : "واحد"}`;
  if (count === 2) return dual;
  if (count >= 3 && count <= 10) return `${words} ${plural}`;

  // مضاعفات المائة تُضاف: «ألفا جنيه» لا «ألفان جنيهاً»
  if (count % 100 === 0) return `${adjustDualsForIdafa(words)} ${singular}`;

  // في العدد المعطوف يتبع التمييزُ آخرَ عدد: 103 ← «مائة وثلاثة ريالات»
  const remainder = count % 100;
  if (remainder >= 3 && remainder <= 10) return `${words} ${plural}`;

  return `${words} ${accusativeForm(singular)}`;
}

function formatFraction(
  decimalPart: number, fracGender: "M" | "F", fracSing: string, fracPlural: string
): string {
  const decWords = numberToArabicWords(decimalPart, fracGender);
  return currencyGrammar(
    decimalPart, decWords, fracSing,
    buildDual(fracSing, fracGender), fracPlural, fracGender
  );
}

/**
 * تفقيط مبلغ مالي بالعربية.
 * @param amount المبلغ — يُقبل نصّاً للحفاظ على الدقة العشرية
 * @param currency رمز العملة
 */
export function tafgeet(amount: number | string, currency: string = "SAR"): string {
  if (typeof currency !== "string") return "خطأ: رمز العملة يجب أن يكون نصاً";
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (typeof numeric !== "number" || !isFinite(numeric)) {
    return "خطأ: المبلغ يجب أن يكون رقماً محدداً";
  }
  if (!(currency in CURRENCY_UNITS)) return `عملة غير مدعومة: ${currency}`;

  const unit = CURRENCY_UNITS[currency];
  const { integerPart, decimalPart, negative } = splitDecimal(amount, unit.decimals);

  const fracSing = unit.fraction_singular;
  const fracGender: "M" | "F" = fracSing.endsWith("ة") ? "F" : "M";

  if (integerPart === 0) {
    if (decimalPart === 0) {
      const zero = `صفر ${unit.singular}`;
      return negative ? `سالب ${zero}` : zero;
    }
    const decOnly = formatFraction(decimalPart, fracGender, fracSing, unit.fraction_plural);
    return negative ? `سالب ${decOnly}` : decOnly;
  }

  // وحدات العملة الرئيسية كلها مذكرة
  const intWords = numberToArabicWords(integerPart, "M");
  const intStr = currencyGrammar(
    integerPart, intWords, unit.singular, unit.dual, unit.plural, "M"
  );

  if (decimalPart === 0) return negative ? `سالب ${intStr}` : intStr;

  const decStr = formatFraction(decimalPart, fracGender, fracSing, unit.fraction_plural);
  const result = `${intStr} و${decStr}`;
  return negative ? `سالب ${result}` : result;
}

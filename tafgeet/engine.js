/**
 * ⚠️ نسخة مُودَعة (vendored) من محرّك التفقيط — **لا تُحرَّر هنا.**
 *
 * مصدر الحقيقة: `cheque-tool/js/tafgeet.js`. تُنسخ هنا ليكون المقياس قائماً
 * بذاته وقابلاً لإعادة التشغيل من أي نسخة من المستودع بلا مسارات نسبية هشّة.
 * ويحرس التطابقَ اختبارٌ يفشل عند أول انحراف: `tests/no-drift.test.mjs`.
 */
/**
 * التفقيط العربي — محرّك مستقل يعمل في المتصفح بلا اعتماديات.
 *
 * **منقول عن نسخة بايثون المرجعية** في
 * `arabic-invoice-mcp/src/arabic_invoice_mcp/server.py` (184 اختباراً).
 *
 * ⚠️ ملاحظة مكلفة: النقل الأول جرى عن نسخة TypeScript، فأنتج **215 اختلافاً
 * من 540 حالة** — تلك النسخة مبسّطة وتفتقد التذكير/التأنيث، وإسقاط النون عند
 * الإضافة، وجموع التكسير الصحيحة (تقول «دينارات» والصواب «دنانير»).
 * `tests/parity.test.mjs` هو ما كشفها، ويحرس ضد عودتها.
 *
 * ما يميّز هذا المحرّك:
 *   2 ريال        ← «ريالان»              مثنى، لا «اثنان ريال»
 *   3 ريال        ← «ثلاثة ريالات»         جمع القلة
 *   11 ريال       ← «أحد عشر ريالاً»       تمييز مفرد منصوب
 *   103 ريال      ← «مائة وثلاثة ريالات»   التمييز يتبع آخر عدد معطوف
 *   2000 جنيه     ← «ألفا جنيه»            إسقاط النون عند الإضافة
 *   0.750 دينار   ← «سبعمائة وخمسون فلساً» ثلاث منازل للدينار
 *   0.02 ريال     ← «هللتان»               مثنى المؤنث
 */

const ONES_M = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة",
  "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر",
  "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر",
  "تسعة عشر"
];

const ONES_F = [
  "", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع",
  "ثماني", "تسع", "عشر", "إحدى عشرة", "اثنتا عشرة", "ثلاث عشرة",
  "أربع عشرة", "خمس عشرة", "ست عشرة", "سبع عشرة", "ثماني عشرة",
  "تسع عشرة"
];

const TENS = [
  "", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون",
  "سبعون", "ثمانون", "تسعون"
];

const HUNDREDS = [
  "", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
  "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"
];

const SCALES = [[1, ""], [1000, "ألف"], [1000000, "مليون"],
                [1000000000, "مليار"], [1000000000000, "تريليون"]];

const SCALE_PLURALS = {
  "ألف": "آلاف", "مليون": "ملايين", "مليار": "مليارات", "تريليون": "تريليونات"
};

const IDAFA_DUALS = [
  ["مئتان", "مئتا"], ["ألفان", "ألفا"], ["مليونان", "مليونا"],
  ["ملياران", "مليارا"], ["تريليونان", "تريليونا"]
];

export const CURRENCY_UNITS = {
  EGP: { singular: "جنيه", dual: "جنيهان", plural: "جنيهات", fraction_singular: "قرش", fraction_plural: "قروش", decimals: 2, name: "جنيه مصري" },
  SAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "هللة", fraction_plural: "هللات", decimals: 2, name: "ريال سعودي" },
  AED: { singular: "درهم", dual: "درهمان", plural: "دراهم", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 2, name: "درهم إماراتي" },
  QAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "درهم", fraction_plural: "دراهم", decimals: 2, name: "ريال قطري" },
  USD: { singular: "دولار", dual: "دولاران", plural: "دولارات", fraction_singular: "سنت", fraction_plural: "سنتات", decimals: 2, name: "دولار أمريكي" },
  KWD: { singular: "دينار", dual: "ديناران", plural: "دنانير", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 3, name: "دينار كويتي" },
  BHD: { singular: "دينار", dual: "ديناران", plural: "دنانير", fraction_singular: "فلس", fraction_plural: "فلوس", decimals: 3, name: "دينار بحريني" },
  OMR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "بيسة", fraction_plural: "بيسات", decimals: 3, name: "ريال عُماني" },
};

export const CURRENCY_DECIMALS = Object.fromEntries(
  Object.entries(CURRENCY_UNITS).map(([k, v]) => [k, v.decimals])
);

// ── الحساب العشري الدقيق ────────────────────────────────────────────────
/**
 * تقسيم المبلغ إلى (صحيح، كسر) **بحساب عشري نصّي لا عائم**.
 *
 * في شيكٍ لا يجوز أن يضيع قرش. و`(1250.75 - 1250) * 100` تساوي
 * 74.99999999999997 في JS، و`(1.005).toFixed(2)` تعطي "1.00" لا "1.01".
 * لذلك نقرأ الرقم كنصّ ونقرّب يدوياً بنصف-لأعلى — مطابقاً لـ
 * `Decimal(str(x))` مع `ROUND_HALF_UP` في بايثون.
 */
function splitDecimal(value, decimals) {
  let s = typeof value === "string" ? value.trim() : String(value);
  if (/e/i.test(s)) s = Number(s).toFixed(Math.max(decimals + 2, 20));

  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);

  let [intStr = "0", fracStr = ""] = s.split(".");
  intStr = intStr.replace(/^0+(?=\d)/, "") || "0";

  // تقريب نصف-لأعلى عند المنزلة المطلوبة
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
function convertHundreds(n, gender = "M") {
  if (n === 0) return "";
  const parts = [];
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
        let onesWord;
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

function convertLessThanThousand(n, scaleWord, scaleValue, gender = "M") {
  if (n === 0) return "";
  const grpGender = scaleValue === 1 ? gender : "M";
  let base = convertHundreds(n, grpGender);
  if (scaleValue === 1) return base;
  if (base === "مئتان") base = "مئتا";           // مئتا ألف — إسقاط النون بالإضافة
  if (n === 1) return scaleWord;
  if (n === 2) return `${scaleWord}ان`;
  if (n >= 3 && n <= 10) return `${base} ${SCALE_PLURALS[scaleWord] || scaleWord + "ات"}`;
  return `${base} ${scaleWord}`;
}

/** تحويل عدد صحيح إلى كلمات عربية. */
export function numberToArabicWords(n, gender = "M") {
  if (typeof n !== "number" || !isFinite(n)) {
    throw new Error("الرقم يجب أن يكون قيمة عددية محددة");
  }
  if (n === 0) return "صفر";
  const isNegative = n < 0;
  let num = Math.trunc(Math.abs(n));
  if (num === 0) return "صفر";

  const groups = [];
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
  const words = groups.filter(Boolean).join(" و");
  return isNegative ? `سالب ${words}` : words;
}

// ── قواعد العملة ────────────────────────────────────────────────────────
/** التاء المربوطة تدل على النصب فلا تُنوَّن؛ وغيرها يُنوَّن بالفتح. */
function accusativeForm(word) {
  return word.endsWith("ة") ? word : word + "اً";
}

/** إسقاط النون من المثنى عند الإضافة: ألفان → ألفا، مئتان → مئتا. */
function adjustDualsForIdafa(words) {
  for (const [dual, idafa] of IDAFA_DUALS) {
    if (words.endsWith(dual)) return words.slice(0, -dual.length) + idafa;
  }
  return words;
}

/** بناء المثنى من المفرد: هللة → هللتان، فلس → فلسان. */
function buildDual(singular, gender) {
  return gender === "F" ? singular.slice(0, -1) + "تان" : singular + "ان";
}

function currencyGrammar(count, words, singular, dual, plural, gender) {
  if (count === 1) return `${singular} ${gender === "F" ? "واحدة" : "واحد"}`;
  if (count === 2) return dual;
  if (count >= 3 && count <= 10) return `${words} ${plural}`;

  // مضاعفات المائة تُضاف: «ألفا جنيه» لا «ألفان جنيهاً»
  if (count % 100 === 0) return `${adjustDualsForIdafa(words)} ${singular}`;

  // في العدد المعطوف يتبع التمييزُ آخرَ عدد: 103 → «مائة وثلاثة ريالات»
  const remainder = count % 100;
  if (remainder >= 3 && remainder <= 10) return `${words} ${plural}`;

  return `${words} ${accusativeForm(singular)}`;
}

function formatFraction(decimalPart, fracGender, fracSing, fracPlural) {
  const decWords = numberToArabicWords(decimalPart, fracGender);
  return currencyGrammar(decimalPart, decWords, fracSing,
                         buildDual(fracSing, fracGender), fracPlural, fracGender);
}

/**
 * تفقيط مبلغ مالي بالعربية.
 * @param {number|string} amount المبلغ — يُقبل نصّاً للحفاظ على الدقة العشرية
 * @param {string} currency رمز العملة (EGP افتراضياً)
 * @returns {string} النص المفقّط، أو رسالة خطأ عربية
 */
export function tafgeet(amount, currency = "EGP") {
  if (typeof currency !== "string") return "خطأ: رمز العملة يجب أن يكون نصاً";
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (typeof numeric !== "number" || !isFinite(numeric)) {
    return "خطأ: المبلغ يجب أن يكون رقماً محدداً";
  }
  if (!(currency in CURRENCY_UNITS)) return `عملة غير مدعومة: ${currency}`;

  const unit = CURRENCY_UNITS[currency];
  const { integerPart, decimalPart, negative } = splitDecimal(amount, unit.decimals);

  const fracSing = unit.fraction_singular;
  const fracGender = fracSing.endsWith("ة") ? "F" : "M";

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
  const intStr = currencyGrammar(integerPart, intWords, unit.singular,
                                 unit.dual, unit.plural, "M");

  if (decimalPart === 0) return negative ? `سالب ${intStr}` : intStr;

  const decStr = formatFraction(decimalPart, fracGender, fracSing, unit.fraction_plural);
  const result = `${intStr} و${decStr}`;
  return negative ? `سالب ${result}` : result;
}

/** الصيغة التي تُكتب على الشيك: «فقط … لا غير». */
export function chequeWords(amount, currency = "EGP") {
  const words = tafgeet(amount, currency);
  if (words.startsWith("خطأ") || words.startsWith("عملة")) return words;
  return `فقط ${words} لا غير`;
}

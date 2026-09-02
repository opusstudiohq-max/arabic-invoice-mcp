/**
 * نموذج بيانات الفاتورة الضريبية، وحسابُ مجاميعها.
 *
 * ### المبدأ الحاكم: لا نخترع مالاً
 *
 * تُحسب المجاميع من البنود، ولا تُقبل من المستدعي — إلا `lineTotal` فهو
 * ملك نظامه المحاسبي. وأيّ رقمٍ نطبعه على فاتورة يجب أن يكون مشتقاً من
 * مدخلٍ صريح أو محسوباً بقاعدة مكتوبة، لا مُقدَّراً.
 *
 * ### والحساب بالهللات لا بالكسور العشرية
 *
 * `0.1 + 0.2 !== 0.3` في كل لغة تستعمل الفاصلة العائمة، و`(1.005).toFixed(2)`
 * تُعطي `"1.00"` لا `"1.01"`. فاتورةٌ تُبنى على ذلك تُخطئ في هللة، وتلك
 * الهللة هي ما يرفض المُحقِّق الفاتورةَ من أجله.
 *
 * فكل المبالغ هنا **أعدادٌ صحيحة بأصغر وحدة** (هللة/قرش)، والتحويل إلى
 * نصّ يقع مرّة واحدة عند الطباعة.
 */

/** مبلغ بأصغر وحدة نقدية — 1.50 ريال = 150. */
export type Minor = number;

export interface Party {
  name: string;
  /** الرقم الضريبي — مطلوب للبائع، واختياري للمشتري في الفاتورة المبسطة. */
  vatNumber?: string;
  address?: string;
  /** رقم السجل التجاري أو ما يقوم مقامه. */
  registrationNumber?: string;
}

export interface InvoiceLine {
  description: string;
  /** الكمية — تُقبل كسرية (2.5 كجم)، وتُطبع كما تُعطى. */
  quantity: number;
  /** سعر الوحدة قبل الضريبة، بأصغر وحدة. */
  unitPrice: Minor;
  /** نسبة الضريبة مئويةً: 15 تعني 15%. */
  vatRate: number;
  /**
   * إجمالي البند قبل الضريبة، بأصغر وحدة.
   *
   * يُؤخذ من نظام المستدعي المحاسبي إن مُرِّر — فالتقريب في ضرب كمية كسرية
   * قرارٌ محاسبي يخصّه هو، لا نحن. وإن غاب حُسب `quantity × unitPrice`
   * بتقريب نصفٍ إلى أعلى.
   */
  lineTotal?: Minor;
}

export interface Invoice {
  /** رقم الفاتورة كما يظهر للعميل. */
  number: string;
  /** تاريخ ووقت الإصدار، ISO 8601 مع منطقة زمنية. */
  issuedAt: string;
  seller: Party;
  buyer?: Party;
  lines: InvoiceLine[];
  /** رمز العملة الثلاثي: SAR، EGP… */
  currency: string;
  /**
   * نوع الفاتورة. المبسطة (B2C) لا تُلزم ببيانات المشتري، والضريبية
   * (B2B) تُلزم برقمه الضريبي.
   */
  kind?: "simplified" | "standard";
  notes?: string;
}

export interface ComputedLine extends InvoiceLine {
  lineTotal: Minor;
  vatAmount: Minor;
  lineTotalWithVat: Minor;
}

export interface InvoiceTotals {
  lines: ComputedLine[];
  /** المجموع قبل الضريبة. */
  subtotal: Minor;
  /** مجموع الضريبة. */
  vatTotal: Minor;
  /** الإجمالي شامل الضريبة. */
  total: Minor;
  /** الضريبة مجمَّعة بالنسبة — الفاتورة قد تحمل نسباً مختلفة. */
  vatByRate: Array<{ rate: number; taxable: Minor; vat: Minor }>;
}

/** تقريب نصفٍ إلى أعلى على الأعداد الصحيحة الموجبة والسالبة معاً. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * حساب مجاميع الفاتورة.
 *
 * الضريبة تُحسب **لكل بند على حدة** ثم تُجمع — لا على المجموع الكلي.
 * والفرق بينهما هللةٌ أو اثنتان في فاتورة ذات بنود كثيرة، وهي الهللة التي
 * تُفشل المطابقة.
 */
export function computeTotals(invoice: Invoice): InvoiceTotals {
  if (!invoice.lines?.length) throw new Error("الفاتورة بلا بنود");

  const lines: ComputedLine[] = invoice.lines.map((line, index) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error(`البند ${index + 1}: الكمية يجب أن تكون موجبة`);
    }
    if (!Number.isInteger(line.unitPrice)) {
      throw new Error(`البند ${index + 1}: سعر الوحدة يجب أن يكون عدداً صحيحاً بأصغر وحدة`);
    }
    if (!Number.isFinite(line.vatRate) || line.vatRate < 0) {
      throw new Error(`البند ${index + 1}: نسبة ضريبة غير صالحة`);
    }
    const lineTotal = line.lineTotal ?? roundHalfUp(line.quantity * line.unitPrice);
    if (!Number.isInteger(lineTotal)) {
      throw new Error(`البند ${index + 1}: إجمالي البند يجب أن يكون عدداً صحيحاً بأصغر وحدة`);
    }
    const vatAmount = roundHalfUp((lineTotal * line.vatRate) / 100);
    return { ...line, lineTotal, vatAmount, lineTotalWithVat: lineTotal + vatAmount };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const vatTotal = lines.reduce((sum, l) => sum + l.vatAmount, 0);

  const byRate = new Map<number, { rate: number; taxable: Minor; vat: Minor }>();
  for (const line of lines) {
    const entry = byRate.get(line.vatRate) ?? { rate: line.vatRate, taxable: 0, vat: 0 };
    entry.taxable += line.lineTotal;
    entry.vat += line.vatAmount;
    byRate.set(line.vatRate, entry);
  }

  return {
    lines,
    subtotal,
    vatTotal,
    total: subtotal + vatTotal,
    vatByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

/**
 * المبلغ نصّاً كما يُطبع ويُوضع في رمز QR.
 *
 * التقسيم على 100 هنا **آخر** عملية، وعلى عدد صحيح — فلا تراكم خطأ.
 */
export function formatMinor(amount: Minor, fractionDigits = 2): string {
  const negative = amount < 0;
  const abs = Math.abs(amount).toString().padStart(fractionDigits + 1, "0");
  const whole = abs.slice(0, abs.length - fractionDigits) || "0";
  const fraction = abs.slice(abs.length - fractionDigits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

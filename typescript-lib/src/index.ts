/**
 * Arabic Invoice MCP Server — TypeScript Port
 * =============================================
 * خادم MCP للفواتير العربية — نسخة TypeScript
 *
 * Port of the Python `arabic-invoice-mcp` v2.0 core tools to TypeScript.
 * Compatible with all MCP clients (Claude Desktop, Cursor, Windsurf).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "crypto";

// =============================================================================
// Core: Arabic Tafgeet Engine (تفقيط الأرقام بالعربية)
// =============================================================================

const ONES = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة",
  "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر",
  "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر",
  "تسعة عشر"
];

const TENS = [
  "", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون",
  "سبعون", "ثمانون", "تسعون"
];

const HUNDREDS = [
  "", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
  "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"
];

const SCALES: Array<[number, string]> = [
  [1, ""],
  [1000, "ألف"],
  [1000000, "مليون"],
  [1000000000, "مليار"],
  [1000000000000, "تريليون"],
];

const CURRENCY_UNITS: Record<string, {
  singular: string; dual: string; plural: string;
  fraction_singular: string; fraction_plural: string;
}> = {
  SAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "هللة", fraction_plural: "هللات" },
  EGP: { singular: "جنيه", dual: "جنيهان", plural: "جنيهات", fraction_singular: "قرش", fraction_plural: "قروش" },
  AED: { singular: "درهم", dual: "درهمان", plural: "دراهم", fraction_singular: "فلس", fraction_plural: "فلوس" },
  USD: { singular: "دولار", dual: "دولاران", plural: "دولارات", fraction_singular: "سنت", fraction_plural: "سنتات" },
  KWD: { singular: "دينار", dual: "ديناران", plural: "دينارات", fraction_singular: "فلس", fraction_plural: "فلوس" },
  BHD: { singular: "دينار", dual: "ديناران", plural: "دينارات", fraction_singular: "فلس", fraction_plural: "فلوس" },
  OMR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "بيسة", fraction_plural: "بيسات" },
  QAR: { singular: "ريال", dual: "ريالان", plural: "ريالات", fraction_singular: "درهم", fraction_plural: "دراهم" },
};

// عدد المنازل العشرية لكل عملة — الدينار الكويتي والبحريني والريال العُماني ثلاث منازل (1000 وحدة فرعية)
const CURRENCY_DECIMALS: Record<string, number> = {
  SAR: 2, EGP: 2, AED: 2, USD: 2, QAR: 2,
  KWD: 3, BHD: 3, OMR: 3,
};

const VAT_RATES: Record<string, number> = {
  SA: 0.15, EG: 0.14, AE: 0.05,
  BH: 0.10, KW: 0.00, QA: 0.00, OM: 0.05,
};

/**
 * تحويل آحاد/عشرات/مئات.
 */
function convertHundreds(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const h = Math.trunc(n / 100);
  const remainder = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const t = Math.trunc(remainder / 10);
      const o = remainder % 10;
      if (o > 0) {
        parts.push(`${ONES[o]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }
  return parts.join(" و");
}

/**
 * تحويل الأرقام إلى كلمات عربية.
 */
export function numberToArabicWords(n: number): string {
  if (typeof n !== "number" || isNaN(n) || !isFinite(n)) {
    throw new Error("الرقم يجب أن يكون قيمة عددية محددة");
  }
  if (n === 0) return "صفر";

  const isNegative = n < 0;
  n = Math.abs(n);

  const integerPart = Math.trunc(n);

  let intWords: string;
  if (integerPart === 0) {
    intWords = "صفر";
  } else {
    const groups: string[] = [];
    let num = integerPart;
    let scaleIdx = 0;
    while (num > 0 && scaleIdx < SCALES.length) {
      const group = num % 1000;
      if (group > 0) {
        const [scaleValue, scaleWord] = SCALES[scaleIdx];
        let groupWords = convertHundreds(group);
        if (scaleValue !== 1) {
          if (group === 1) {
            groupWords = scaleWord;
          } else if (group === 2) {
            groupWords = `${scaleWord}ان`;
          } else if (group >= 3 && group <= 10) {
            const pluralMap: Record<string, string> = {
              "ألف": "آلاف", "مليون": "ملايين", "مليار": "مليارات", "تريليون": "تريليونات"
            };
            const plural = pluralMap[scaleWord] || scaleWord + "ات";
            groupWords = `${convertHundreds(group)} ${plural}`;
          } else {
            groupWords = `${convertHundreds(group)} ${scaleWord}`;
          }
        }
        groups.push(groupWords);
      }
      num = Math.trunc(num / 1000);
      scaleIdx += 1;
    }
    groups.reverse();
    intWords = groups.filter(g => g).join(" و");
  }

  const decimalPart = Math.round((n - integerPart) * 100);
  if (decimalPart > 0) {
    const decWords = convertHundreds(decimalPart);
    return isNegative
      ? `سالب ${intWords} و${decWords}`
      : `${intWords} و${decWords}`;
  }
  return isNegative ? `سالب ${intWords}` : intWords;
}

/**
 * تحويل الكلمة إلى صيغة النصب (تمييز).
 */
function accusativeForm(word: string): string {
  if (word.endsWith("ة")) {
    return word; // مؤنث خماسي - التاء المربوطة تدل على النصب
  }
  return word + "اً";
}

/**
 * تفقيط مبلغ مالي بالعربية.
 */
export function tafgeet(amount: number, currency: string = "SAR"): string {
  if (typeof currency !== "string") {
    return "خطأ: رمز العملة يجب أن يكون نصاً";
  }
  if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
    return "خطأ: المبلغ يجب أن يكون رقماً محدداً";
  }
  if (!(currency in CURRENCY_UNITS)) {
    return `عملة غير مدعومة: ${currency}`;
  }

  const unit = CURRENCY_UNITS[currency];
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const scale = Math.pow(10, decimals);
  const integerPart = Math.trunc(amount);
  const decimalPart = Math.abs(Math.round((amount - integerPart) * scale));

  const intWords = numberToArabicWords(integerPart);
  const absIntegerPart = Math.abs(integerPart);

  let intStr: string;
  if (absIntegerPart === 1) {
    if (integerPart === 1) {
      intStr = `${unit.singular} واحد`;
    } else {
      intStr = `سالب ${unit.singular} واحد`;
    }
  } else if (absIntegerPart === 2) {
    intStr = integerPart < 0 ? `سالب ${unit.dual}` : unit.dual;
  } else if (absIntegerPart >= 3 && absIntegerPart <= 10) {
    intStr = `${intWords} ${unit.plural}`;
  } else {
    intStr = `${intWords} ${accusativeForm(unit.singular)}`;
  }

  if (decimalPart === 0) return intStr;

  let decStr: string;
  if (decimalPart === 1) {
    decStr = `${unit.fraction_singular} واحدة`;
  } else if (decimalPart === 2) {
    decStr = unit.fraction_singular + "تان";
  } else if (decimalPart >= 3 && decimalPart <= 10) {
    decStr = `${numberToArabicWords(decimalPart)} ${unit.fraction_plural}`;
  } else {
    decStr = `${numberToArabicWords(decimalPart)} ${accusativeForm(unit.fraction_singular)}`;
  }

  return `${intStr} و${decStr}`;
}

/**
 * حساب VAT حسب الدولة.
 */
export function calculateVat(
  amount: number,
  country: "SA" | "EG" | "AE" | "BH" | "KW" | "QA" | "OM" = "SA"
): Record<string, any> {
  if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
    throw new Error("المبلغ يجب أن يكون قيمة عددية محددة");
  }
  if (!(country in VAT_RATES)) {
    throw new Error(`رمز الدولة غير مدعوم: ${country}`);
  }
  const rate = VAT_RATES[country] ?? 0;
  const countryNames: Record<string, string> = {
    SA: "المملكة العربية السعودية", EG: "مصر", AE: "الإمارات العربية المتحدة",
    BH: "البحرين", KW: "الكويت", QA: "قطر", OM: "عُمان",
  };
  return {
    country,
    country_name: countryNames[country] ?? country,
    vat_rate_percent: Math.round(rate * 100),
    net_amount: Math.round(amount * 100) / 100,
    vat_amount: Math.round(amount * rate * 100) / 100,
    total_inclusive: Math.round(amount * (1 + rate) * 100) / 100,
    total_in_arabic_words: tafgeet(Math.round(amount * (1 + rate) * 100) / 100, "SAR"),
  };
}

// =============================================================================
// ZATCA QR Code (TLV + Base64)
// =============================================================================

function tlv(tag: number, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > 255) {
    throw new Error(`TLV value too long (${encoded.length} bytes)`);
  }
  return new Uint8Array([tag, encoded.length, ...encoded]);
}

export interface ZatcaQRResult {
  base64_data: string;
  tlv_hex: string;
}

export function buildZatcaQr(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalWithVat: string,
  vatAmount: string
): ZatcaQRResult {
  if (!sellerName?.trim()) throw new Error("اسم البائع مطلوب");
  if (!vatNumber || vatNumber.length !== 15 || !/^\d+$/.test(vatNumber)) {
    throw new Error(`الرقم الضريبي يجب أن يكون 15 رقم`);
  }
  if (!vatNumber.startsWith("3")) {
    throw new Error("الرقم الضريبي السعودي يجب أن يبدأ بـ 3");
  }
  if (!timestamp?.includes("T")) {
    throw new Error(`timestamp must be ISO 8601`);
  }

  const tlv1 = tlv(1, sellerName.trim());
  const tlv2 = tlv(2, vatNumber.trim());
  const tlv3 = tlv(3, timestamp.trim());
  const tlv4 = tlv(4, totalWithVat);
  const tlv5 = tlv(5, vatAmount);

  const total = new Uint8Array(tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length);
  let offset = 0;
  for (const arr of [tlv1, tlv2, tlv3, tlv4, tlv5]) {
    total.set(arr, offset);
    offset += arr.length;
  }

  return {
    base64_data: Buffer.from(total).toString("base64"),
    tlv_hex: Buffer.from(total).toString("hex"),
  };
}

export function encodeZatcaQr(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalWithVat: string,
  vatAmount: string
): string {
  return buildZatcaQr(sellerName, vatNumber, timestamp, totalWithVat, vatAmount).base64_data;
}

// =============================================================================
// Invoicing Engine
// =============================================================================

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

export interface InvoiceInput {
  invoice_number: string;
  seller_name: string;
  buyer_name: string;
  items: InvoiceItemInput[];
  country?: string;
  currency?: string;
  seller_vat?: string | null;
  buyer_vat?: string | null;
  notes?: string | null;
}

export interface InvoiceOutput {
  invoice_number: string;
  issue_date: string;
  seller: { name: string; vat: string | null };
  buyer: { name: string; vat: string | null };
  country: string;
  currency: string;
  items: InvoiceItem[];
  subtotal: number;
  total_tax: number;
  total: number;
  total_in_arabic_words: string;
  notes: string | null;
  zatca_qr?: any;
}

export function createInvoice(input: InvoiceInput): InvoiceOutput {
  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("يجب إضافة صنف واحد على الأقل في الفاتورة");
  }
  const country = input.country || "SA";
  const currency = input.currency || "SAR";
  if (!(country in VAT_RATES)) {
    throw new Error(`رمز الدولة غير مدعوم: ${country}`);
  }
  if (!(currency in CURRENCY_UNITS)) {
    throw new Error(`رمز العملة غير مدعوم: ${currency}`);
  }

  if (country === "SA") {
    if (input.seller_vat && (input.seller_vat.length !== 15 || !/^\d+$/.test(input.seller_vat) || !input.seller_vat.startsWith("3"))) {
      throw new Error("الرقم الضريبي للبائع السعودي يجب أن يتكون من 15 رقماً ويبدأ بـ 3");
    }
    if (input.buyer_vat && (input.buyer_vat.length !== 15 || !/^\d+$/.test(input.buyer_vat) || !input.buyer_vat.startsWith("3"))) {
      throw new Error("الرقم الضريبي للمشتري السعودي يجب أن يتكون من 15 رقماً ويبدأ بـ 3");
    }
  }

  const defaultTax = VAT_RATES[country] ?? 0.15;

  const items: InvoiceItem[] = input.items.map((it, idx) => {
    if (!it.description) {
      throw new Error(`وصف الصنف في الفهرس ${idx} مطلوب`);
    }
    const quantity = Number(it.quantity);
    const unitPrice = Number(it.unit_price);
    const taxRate = it.tax_rate !== undefined ? Number(it.tax_rate) : defaultTax;

    if (isNaN(quantity) || !isFinite(quantity) || quantity < 0) {
      throw new Error(`الكمية للصنف '${it.description}' يجب أن تكون قيمة عددية أكبر من أو تساوي الصفر`);
    }
    if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`سعر الوحدة للصنف '${it.description}' يجب أن يكون قيمة عددية أكبر من أو تساوي الصفر`);
    }
    if (isNaN(taxRate) || !isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw new Error(`نسبة الضريبة للصنف '${it.description}' يجب أن تكون بين 0 و 1`);
    }

    const subtotal = round2(quantity * unitPrice);
    const tax_amount = round2(subtotal * taxRate);
    const total = round2(subtotal + tax_amount);

    return {
      description: it.description,
      quantity,
      unit_price: unitPrice,
      subtotal,
      tax_rate: taxRate,
      tax_amount,
      total,
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  const total_tax = round2(items.reduce((sum, item) => sum + item.tax_amount, 0));
  const total = round2(items.reduce((sum, item) => sum + item.total, 0));
  const total_in_arabic_words = tafgeet(total, currency);

  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const issue_date = `${year}-${month}-${day}`;

  return {
    invoice_number: input.invoice_number,
    issue_date,
    seller: { name: input.seller_name, vat: input.seller_vat || null },
    buyer: { name: input.buyer_name, vat: input.buyer_vat || null },
    country,
    currency,
    items,
    subtotal,
    total_tax,
    total,
    total_in_arabic_words,
    notes: input.notes || null,
  };
}

export function formatInvoiceArabic(invoiceData: any): string {
  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push(`              فاتورة ضريبية رقم: ${invoiceData.invoice_number}`);
  lines.push("=".repeat(60));
  lines.push(`التاريخ: ${invoiceData.issue_date}`);
  lines.push(`البائع: ${invoiceData.seller.name}`);
  if (invoiceData.seller.vat) {
    lines.push(`الرقم الضريبي للبائع: ${invoiceData.seller.vat}`);
  }
  lines.push(`المشتري: ${invoiceData.buyer.name}`);
  if (invoiceData.buyer.vat) {
    lines.push(`الرقم الضريبي للمشتري: ${invoiceData.buyer.vat}`);
  }
  lines.push("-".repeat(60));

  // Header
  const col1 = "الصنف".padEnd(30, " ");
  const col2 = "الكمية".padEnd(10, " ");
  const col3 = "السعر".padEnd(10, " ");
  const col4 = "الإجمالي".padEnd(10, " ");
  lines.push(`${col1}${col2}${col3}${col4}`);
  lines.push("-".repeat(60));

  for (const item of invoiceData.items) {
    const desc = (item.description || "").substring(0, 30).padEnd(30, " ");
    const qty = String(item.quantity).padEnd(10, " ");
    const price = String(item.unit_price).padEnd(10, " ");
    const tot = String(item.total).padEnd(10, " ");
    lines.push(`${desc}${qty}${price}${tot}`);
  }

  lines.push("-".repeat(60));
  lines.push(`المجموع الفرعي: ${invoiceData.subtotal} ${invoiceData.currency}`);
  lines.push(`ضريبة القيمة المضافة: ${invoiceData.total_tax} ${invoiceData.currency}`);
  lines.push("=".repeat(60));
  lines.push(`الإجمالي: ${invoiceData.total} ${invoiceData.currency}`);
  lines.push(`الإجمالي بالكلمات: ${invoiceData.total_in_arabic_words}`);
  if (invoiceData.notes) {
    lines.push(`ملاحظات: ${invoiceData.notes}`);
  }
  lines.push("=".repeat(60));

  return lines.join("\n");
}

export function hashInvoiceForZatca(xmlContent: string, algorithm = "sha256"): {
  hash: string;
  algorithm: string;
  length: number;
  note: string;
} {
  const allowed = ["sha256", "sha384", "sha512"];
  if (!allowed.includes(algorithm)) {
    throw new Error(`Algorithm غير مدعوم: ${algorithm}`);
  }
  const hash = crypto.createHash(algorithm).update(xmlContent, "utf-8").digest("hex");
  return {
    hash,
    algorithm,
    length: hash.length,
    note: "ZATCA Phase 2 requires sha256 of the canonicalized invoice XML",
  };
}

export function createZatcaCompliantInvoice(input: {
  invoice_number: string;
  seller_name: string;
  seller_vat: string;
  buyer_name: string;
  items: InvoiceItemInput[];
  country?: string;
  currency?: string;
  buyer_vat?: string | null;
  notes?: string | null;
}): InvoiceOutput {
  const country = input.country || "SA";
  const currency = input.currency || "SAR";

  // 1. Create base invoice
  const invoice = createInvoice({
    invoice_number: input.invoice_number,
    seller_name: input.seller_name,
    buyer_name: input.buyer_name,
    items: input.items,
    country,
    currency,
    seller_vat: input.seller_vat,
    buyer_vat: input.buyer_vat,
    notes: input.notes,
  });

  // 2. Generate QR code (if country is SA)
  if (country === "SA") {
    try {
      const timestamp = new Date().toISOString(); // ISO 8601 UTC
      const qrResult = buildZatcaQr(
        input.seller_name,
        input.seller_vat,
        timestamp,
        invoice.total.toFixed(2),
        invoice.total_tax.toFixed(2)
      );

      invoice.zatca_qr = {
        base64_data: qrResult.base64_data,
        tlv_hex: qrResult.tlv_hex,
        compliance: "ZATCA Phase 1 (B2C)",
        timestamp,
        instructions: "Convert base64_data to QR image and attach to invoice PDF",
      };
    } catch (e) {
      invoice.zatca_qr = { error: (e as Error).message };
    }
  } else {
    invoice.zatca_qr = {
      note: `QR code خاص بـ ZATCA السعودية فقط (الدولة الحالية: ${country})`,
    };
  }

  return invoice;
}

// =============================================================================
// MCP Server
// =============================================================================

const server = new McpServer({
  name: "arabic-invoice-mcp",
  version: "1.0.0",
});

// Tool: tafgeet_amount
server.tool(
  "tafgeet_amount",
  "تحويل مبلغ مالي إلى كلمات عربية (تفقيط)",
  {
    amount: z.number().describe("المبلغ الرقمي"),
    currency: z.enum(["SAR", "EGP", "AED", "USD", "KWD", "BHD", "OMR", "QAR"]).default("SAR").describe("رمز العملة"),
  },
  async ({ amount, currency }) => {
    return {
      content: [{ type: "text", text: tafgeet(amount, currency) }],
    };
  }
);

// Tool: convert_number_to_arabic
server.tool(
  "convert_number_to_arabic",
  "تحويل أي رقم إلى كلمات عربية بدون عملة",
  {
    number: z.number().describe("الرقم"),
  },
  async ({ number }) => {
    return {
      content: [{ type: "text", text: numberToArabicWords(number) }],
    };
  }
);

// Tool: calculate_vat
server.tool(
  "calculate_vat",
  "حساب ضريبة القيمة المضافة (VAT) حسب الدولة",
  {
    amount: z.number().describe("المبلغ الصافي قبل الضريبة"),
    country: z.enum(["SA", "EG", "AE", "BH", "KW", "QA", "OM"]).default("SA").describe("رمز الدولة"),
  },
  async ({ amount, country }) => {
    return {
      content: [{ type: "text", text: JSON.stringify(calculateVat(amount, country), null, 2) }],
    };
  }
);

// Tool: list_supported_currencies
server.tool(
  "list_supported_currencies",
  "عرض جميع العملات العربية المدعومة",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(CURRENCY_UNITS, null, 2) }],
    };
  }
);

// Tool: list_supported_vat_rates
server.tool(
  "list_supported_vat_rates",
  "عرض جميع معدلات ضريبة القيمة المضافة المدعومة",
  {},
  async () => {
    const countryNames: Record<string, string> = {
      SA: "المملكة العربية السعودية", EG: "مصر", AE: "الإمارات العربية المتحدة",
      BH: "البحرين", KW: "الكويت", QA: "قطر", OM: "عُمان",
    };
    const result: Record<string, any> = {};
    for (const [code, rate] of Object.entries(VAT_RATES)) {
      result[code] = {
        country_name: countryNames[code],
        vat_rate_percent: rate * 100,
        vat_rate_decimal: rate,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: generate_zatca_qr
server.tool(
  "generate_zatca_qr",
  "توليد QR code للفاتورة الإلكترونية متوافق مع ZATCA السعودية",
  {
    seller_name: z.string().describe("اسم البائع"),
    vat_number: z.string().describe("الرقم الضريبي (15 رقم يبدأ بـ 3)"),
    timestamp: z.string().describe("ISO 8601 timestamp (مثال: 2026-07-04T15:30:00Z)"),
    total_with_vat: z.number().describe("الإجمالي شامل الضريبة"),
    vat_amount: z.number().describe("مبلغ الضريبة"),
  },
  async ({ seller_name, vat_number, timestamp, total_with_vat, vat_amount }) => {
    try {
      const base64 = encodeZatcaQr(
        seller_name,
        vat_number,
        timestamp,
        total_with_vat.toFixed(2),
        vat_amount.toFixed(2)
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ base64_data: base64, compliance: "ZATCA Phase 1 (B2C)" }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool: create_invoice
server.tool(
  "create_invoice",
  "إنشاء فاتورة إلكترونية عربية متوافقة مع ZATCA السعودية",
  {
    invoice_number: z.string().describe("رقم الفاتورة"),
    seller_name: z.string().describe("اسم البائع"),
    buyer_name: z.string().describe("اسم المشتري"),
    items: z.array(z.object({
      description: z.string().describe("وصف الصنف"),
      quantity: z.number().describe("الكمية"),
      unit_price: z.number().describe("سعر الوحدة"),
      tax_rate: z.number().optional().describe("نسبة الضريبة"),
    })).describe("قائمة الأصناف"),
    country: z.string().default("SA").describe("رمز الدولة"),
    currency: z.string().default("SAR").describe("رمز العملة"),
    seller_vat: z.string().optional().nullable().describe("الرقم الضريبي للبائع"),
    buyer_vat: z.string().optional().nullable().describe("الرقم الضريبي للمشتري"),
    notes: z.string().optional().nullable().describe("ملاحظات إضافية"),
  },
  async (input) => {
    try {
      const invoice = createInvoice(input);
      return {
        content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool: format_invoice_arabic
server.tool(
  "format_invoice_arabic",
  "تنسيق بيانات الفاتورة كنص عربي جاهز للطباعة/الإرسال",
  {
    invoice_data: z.any().describe("بيانات الفاتورة (مخرجات create_invoice)"),
  },
  async ({ invoice_data }) => {
    try {
      const formatted = formatInvoiceArabic(invoice_data);
      return {
        content: [{ type: "text", text: formatted }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool: hash_invoice_for_zatca
server.tool(
  "hash_invoice_for_zatca",
  "حساب hash للفاتورة XML (مطلوب لـ ZATCA Phase 2 - B2B)",
  {
    xml_content: z.string().describe("محتوى الفاتورة XML"),
    algorithm: z.enum(["sha256", "sha384", "sha512"]).default("sha256").describe("خوارزمية الـ hash"),
  },
  async ({ xml_content, algorithm }) => {
    try {
      const result = hashInvoiceForZatca(xml_content, algorithm);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool: create_zatca_compliant_invoice
server.tool(
  "create_zatca_compliant_invoice",
  "إنشاء فاتورة إلكترونية كاملة متوافقة مع ZATCA — مع QR code مدمج",
  {
    invoice_number: z.string().describe("رقم الفاتورة"),
    seller_name: z.string().describe("اسم البائع"),
    seller_vat: z.string().describe("الرقم الضريبي للبائع (15 رقم سعودي)"),
    buyer_name: z.string().describe("اسم المشتري"),
    items: z.array(z.object({
      description: z.string().describe("وصف الصنف"),
      quantity: z.number().describe("الكمية"),
      unit_price: z.number().describe("سعر الوحدة"),
      tax_rate: z.number().optional().describe("نسبة الضريبة"),
    })).describe("قائمة الأصناف"),
    country: z.string().default("SA").describe("رمز الدولة"),
    currency: z.string().default("SAR").describe("رمز العملة"),
    buyer_vat: z.string().optional().nullable().describe("الرقم الضريبي للمشتري"),
    notes: z.string().optional().nullable().describe("ملاحظات إضافية"),
  },
  async (input) => {
    try {
      const invoice = createZatcaCompliantInvoice({
        invoice_number: input.invoice_number,
        seller_name: input.seller_name,
        seller_vat: input.seller_vat,
        buyer_name: input.buyer_name,
        items: input.items,
        country: input.country,
        currency: input.currency,
        buyer_vat: input.buyer_vat,
        notes: input.notes,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Only start stdio transport if run directly, not if imported in tests
  if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Arabic Invoice MCP Server (TypeScript) running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

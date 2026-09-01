/**
 * اختبارات TypeScript port — يضمن تطابق الـ output مع Python version.
 */
import { describe, test } from "node:test";
import {
  numberToArabicWords,
  tafgeet,
  calculateVat,
  encodeZatcaQr,
  buildZatcaQr,
  createInvoice,
  formatInvoiceArabic,
  hashInvoiceForZatca,
  createZatcaCompliantInvoice
} from "../src/index";

// Custom expect matcher implementation to bypass Vitest/Vite hash-path issue
function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error("Expected to be defined");
      }
    },
    toContain(expected: string) {
      if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toHaveLength(expected: number) {
      if (!actual || actual.length !== expected) {
        throw new Error(`Expected length ${expected} but got ${actual?.length}`);
      }
    },
    toThrow(expectedMsg?: string) {
      if (typeof actual !== "function") {
        throw new Error("Expected a function to test for throwing");
      }
      try {
        actual();
      } catch (err) {
        if (expectedMsg && !(err as Error).message.includes(expectedMsg)) {
          throw new Error(`Expected error to contain "${expectedMsg}" but got "${(err as Error).message}"`);
        }
        return;
      }
      throw new Error("Expected function to throw");
    }
  };
}

describe("1. Arabic Number Converter (numberToArabicWords)", () => {
  test("Zero", () => {
    expect(numberToArabicWords(0)).toBe("صفر");
  });

  test("One", () => {
    expect(numberToArabicWords(1)).toBe("واحد");
  });

  test("Eleven", () => {
    expect(numberToArabicWords(11)).toBe("أحد عشر");
  });

  test("One Hundred", () => {
    expect(numberToArabicWords(100)).toBe("مائة");
  });

  test("One Thousand", () => {
    expect(numberToArabicWords(1000)).toBe("ألف");
  });

  test("Two Thousand", () => {
    expect(numberToArabicWords(2000)).toBe("ألفان");
  });

  test("One Million", () => {
    expect(numberToArabicWords(1000000)).toBe("مليون");
  });

  test("Negative Number", () => {
    expect(numberToArabicWords(-1)).toBe("سالب واحد");
  });

  test("Negative Number with decimals", () => {
    expect(numberToArabicWords(-123.45)).toBe("سالب مائة وثلاثة وعشرون وخمسة وأربعون");
  });

  test("Large number (billion)", () => {
    expect(numberToArabicWords(1234567890)).toBe("مليار ومئتان وأربعة وثلاثون مليون وخمسمائة وسبعة وستون ألف وثمانمائة وتسعون");
  });
});

describe("2. Tafgeet Money Engine (tafgeet)", () => {
  test("1 SAR", () => {
    expect(tafgeet(1, "SAR")).toBe("ريال واحد");
  });

  test("2 SAR", () => {
    expect(tafgeet(2, "SAR")).toBe("ريالان");
  });

  test("5 SAR", () => {
    expect(tafgeet(5, "SAR")).toBe("خمسة ريالات");
  });

  test("25 SAR", () => {
    expect(tafgeet(25, "SAR")).toBe("خمسة وعشرون ريالاً");
  });

  test("-5 SAR (negative)", () => {
    expect(tafgeet(-5, "SAR")).toBe("سالب خمسة ريالات");
  });

  test("-1.50 SAR (negative with decimals)", () => {
    expect(tafgeet(-1.50, "SAR")).toBe("سالب ريال واحد وخمسون هللة");
  });

  test("1234.56 EGP", () => {
    expect(tafgeet(1234.56, "EGP")).toBe("ألف ومئتان وأربعة وثلاثون جنيهاً وستة وخمسون قرشاً");
  });

  test("12.34 AED", () => {
    expect(tafgeet(12.34, "AED")).toBe("اثنا عشر درهماً وأربعة وثلاثون فلساً");
  });

  test("50.00 KWD", () => {
    expect(tafgeet(50.00, "KWD")).toBe("خمسون ديناراً");
  });

  test("150.75 BHD", () => {
    // BHD = 1000 fils, so 0.75 => 750 (the previous expectation of 75 encoded the bug)
    expect(tafgeet(150.75, "BHD")).toBe("مائة وخمسون ديناراً وسبعمائة وخمسون فلساً");
  });

  test("1000.25 OMR", () => {
    // OMR = 1000 baisa, so 0.25 => 250 (the previous expectation of 25 encoded the bug)
    // صُحِّح: «ألف ريال» لا «ألف ريالاً». الألف يُضاف إلى مفرد مجرور،
    // وكان الاختبار يُشفّر الخطأ النحوي الذي أخفق فيه المحرّك القديم.
    expect(tafgeet(1000.25, "OMR")).toBe("ألف ريال ومئتان وخمسون بيسة");
  });

  test("500.10 QAR", () => {
    // صُحِّح كسابقه: «خمسمائة ريال» — المائة تُضاف إلى مفرد مجرور.
    expect(tafgeet(500.10, "QAR")).toBe("خمسمائة ريال وعشرة دراهم");
  });
});

describe("3. VAT Calculation Engine (calculateVat)", () => {
  test("Saudi Arabia (SA) 15%", () => {
    const res = calculateVat(100, "SA");
    expect(res.vat_rate_percent).toBe(15);
    expect(res.net_amount).toBe(100);
    expect(res.vat_amount).toBe(15);
    expect(res.total_inclusive).toBe(115);
  });

  test("Egypt (EG) 14%", () => {
    const res = calculateVat(100, "EG");
    expect(res.vat_rate_percent).toBe(14);
    expect(res.vat_amount).toBe(14);
    expect(res.total_inclusive).toBe(114);
  });

  test("UAE (AE) 5%", () => {
    const res = calculateVat(100, "AE");
    expect(res.vat_rate_percent).toBe(5);
    expect(res.vat_amount).toBe(5);
    expect(res.total_inclusive).toBe(105);
  });

  test("Bahrain (BH) 10%", () => {
    const res = calculateVat(100, "BH");
    expect(res.vat_rate_percent).toBe(10);
    expect(res.vat_amount).toBe(10);
    expect(res.total_inclusive).toBe(110);
  });

  test("Kuwait (KW) 0%", () => {
    const res = calculateVat(100, "KW");
    expect(res.vat_rate_percent).toBe(0);
    expect(res.vat_amount).toBe(0);
    expect(res.total_inclusive).toBe(100);
  });
});

describe("4. ZATCA QR Code (buildZatcaQr)", () => {
  test("Valid QR building", () => {
    const res = buildZatcaQr(
      "Opus Studio",
      "300123456700003",
      "2026-07-04T15:30:00Z",
      "1150.00",
      "150.00"
    );
    expect(res.base64_data).toBeDefined();
    expect(res.tlv_hex).toBeDefined();
  });

  test("Missing seller name throws error", () => {
    expect(() => buildZatcaQr("", "300123456700003", "2026-07-04T15:30:00Z", "1150.00", "150.00"))
      .toThrow("اسم البائع مطلوب");
  });

  test("Invalid VAT length throws error", () => {
    expect(() => buildZatcaQr("Opus Studio", "123", "2026-07-04T15:30:00Z", "1150.00", "150.00"))
      .toThrow("الرقم الضريبي يجب أن يكون 15 رقم");
  });

  test("VAT not starting with 3 throws error", () => {
    expect(() => buildZatcaQr("Opus Studio", "100123456700003", "2026-07-04T15:30:00Z", "1150.00", "150.00"))
      .toThrow("الرقم الضريبي السعودي يجب أن يبدأ بـ 3");
  });

  test("Invalid ISO 8601 timestamp throws error", () => {
    expect(() => buildZatcaQr("Opus Studio", "300123456700003", "2026-07-04", "1150.00", "150.00"))
      .toThrow("timestamp must be ISO 8601");
  });
});

describe("5. Invoicing Tools", () => {
  test("createInvoice logic", () => {
    const invoice = createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع المعتمد",
      buyer_name: "العميل المميز",
      seller_vat: "300123456700003",
      buyer_vat: "300765432100003",
      country: "SA",
      currency: "SAR",
      items: [
        { description: "جهاز لابتوب", quantity: 2, unit_price: 2500, tax_rate: 0.15 },
        { description: "فأرة لاسلكية", quantity: 5, unit_price: 100, tax_rate: 0.15 }
      ],
      notes: "شكرًا لتعاملكم معنا"
    });

    expect(invoice.subtotal).toBe(5500);
    expect(invoice.total_tax).toBe(825);
    expect(invoice.total).toBe(6325);
    expect(invoice.total_in_arabic_words).toContain("ستة آلاف وثلاثمائة وخمسة وعشرون");
  });

  test("formatInvoiceArabic logic", () => {
    const invoice = createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع المعتمد",
      buyer_name: "العميل المميز",
      seller_vat: "300123456700003",
      items: [
        { description: "خدمات برمجية", quantity: 1, unit_price: 1000 }
      ]
    });
    const txt = formatInvoiceArabic(invoice);
    expect(txt).toContain("فاتورة ضريبية رقم: INV-001");
    expect(txt).toContain("البائع المعتمد");
    expect(txt).toContain("العميل المميز");
    expect(txt).toContain("خدمات برمجية");
    expect(txt).toContain("المجموع الفرعي: 1000 SAR");
  });

  test("hashInvoiceForZatca XML hashing", () => {
    const xml = "<Invoice><ID>INV-123</ID></Invoice>";
    const res = hashInvoiceForZatca(xml, "sha256");
    expect(res.algorithm).toBe("sha256");
    expect(res.hash).toHaveLength(64);
  });

  test("createZatcaCompliantInvoice SA", () => {
    const invoice = createZatcaCompliantInvoice({
      invoice_number: "INV-100",
      seller_name: "Opus Studio",
      seller_vat: "300123456700003",
      buyer_name: "عميل تجريبي",
      country: "SA",
      currency: "SAR",
      items: [
        { description: "استشارة فنية", quantity: 1, unit_price: 1500 }
      ]
    });

    expect(invoice.zatca_qr).toBeDefined();
    expect(invoice.zatca_qr.base64_data).toBeDefined();
    expect(invoice.zatca_qr.tlv_hex).toBeDefined();
    expect(invoice.zatca_qr.compliance).toBe("ZATCA Phase 1 (B2C)");
  });

  test("createZatcaCompliantInvoice EG (non-SA)", () => {
    const invoice = createZatcaCompliantInvoice({
      invoice_number: "INV-100",
      seller_name: "Opus Studio",
      seller_vat: "300123456700003",
      buyer_name: "عميل تجريبي",
      country: "EG",
      currency: "EGP",
      items: [
        { description: "سلع غذائية", quantity: 10, unit_price: 50 }
      ]
    });

    expect(invoice.zatca_qr).toBeDefined();
    expect(invoice.zatca_qr.note).toContain("خاص بـ ZATCA السعودية فقط");
  });

  test("createInvoice validation errors", () => {
    // Empty items should throw
    expect(() => createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع",
      buyer_name: "المشتري",
      items: []
    })).toThrow("يجب إضافة صنف واحد على الأقل في الفاتورة");

    // Invalid country should throw
    expect(() => createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع",
      buyer_name: "المشتري",
      country: "INVALID",
      items: [{ description: "سلعة", quantity: 1, unit_price: 10 }]
    })).toThrow("رمز الدولة غير مدعوم");

    // Negative quantity should throw
    expect(() => createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع",
      buyer_name: "المشتري",
      items: [{ description: "سلعة", quantity: -5, unit_price: 10 }]
    })).toThrow("الكمية للصنف 'سلعة' يجب أن تكون قيمة عددية أكبر من أو تساوي الصفر");

    // Negative price should throw
    expect(() => createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع",
      buyer_name: "المشتري",
      items: [{ description: "سلعة", quantity: 5, unit_price: -10 }]
    })).toThrow("سعر الوحدة للصنف 'سلعة' يجب أن يكون قيمة عددية أكبر من أو تساوي الصفر");

    // Invalid tax rate should throw
    expect(() => createInvoice({
      invoice_number: "INV-001",
      seller_name: "البائع",
      buyer_name: "المشتري",
      items: [{ description: "سلعة", quantity: 5, unit_price: 10, tax_rate: 1.5 }]
    })).toThrow("نسبة الضريبة للصنف 'سلعة' يجب أن تكون بين 0 و 1");
  });
});

// ═══════════════════════════════════════════════════════════════════
// اختبارات انحدار: المنازل العشرية حسب العملة
// الدينار الكويتي/البحريني والريال العُماني = 3 منازل (1000 وحدة فرعية).
// عيب سابق: كان الكسر يُضرب في 100 دائماً، فيُحسب 1.5 KWD كـ50 فلساً بدل 500.
// ═══════════════════════════════════════════════════════════════════
describe("currency decimal precision", () => {
  test("KWD (3 decimals): 1.5 => 500 fils, not 50", () => {
    const out = tafgeet(1.5, "KWD");
    expect(out.includes("خمسمائة") || out.includes("خمسمئة")).toBe(true);
    expect(out.includes("خمسون")).toBe(false);
  });

  test("BHD (3 decimals): 2.5 => 500 fils", () => {
    const out = tafgeet(2.5, "BHD");
    expect(out.includes("خمسمائة") || out.includes("خمسمئة")).toBe(true);
  });

  test("OMR (3 decimals): 1.25 => 250 baisa", () => {
    const out = tafgeet(1.25, "OMR");
    expect(out.includes("مائتان") || out.includes("مئتان") || out.includes("مائتين")).toBe(true);
  });

  test("SAR (2 decimals) unchanged: 1.5 => 50 halalas", () => {
    const out = tafgeet(1.5, "SAR");
    expect(out.includes("خمسون")).toBe(true);
  });

  test("SAR (2 decimals): 10.75 => 75 halalas", () => {
    expect(tafgeet(10.75, "SAR").includes("سبعون")).toBe(true);
  });
});

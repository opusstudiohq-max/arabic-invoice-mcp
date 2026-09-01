/**
 * رسم الفاتورة الضريبية على صفحة A4.
 *
 * هنا تلتقي القطع: الترتيب الصحيح للنصّ العربي (نَسْق)، والمبلغ بالحروف
 * (مُتوافِق)، ورمز QR للمرحلة الأولى — على فاتورة واحدة.
 *
 * ولا يُضمَّن خطّ في هذه الحزمة: يمرّره المستدعي. فالخطوط لها رخصها،
 * وحزمةٌ تحمل خطاً بلا داعٍ تُثقل من لا يحتاجه.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import qrcode from "qrcode-generator";

import { drawArabicText, measureArabicText } from "nasq/pdf-lib";
import { isolate } from "nasq";
import { computeTotals, formatMinor, type Invoice, type InvoiceTotals } from "./model.js";
import { encodeZatcaQr } from "./zatca-qr.js";

/** أبعاد A4 بالنقاط. */
const A4: [number, number] = [595.28, 841.89];

const MARGIN = 42;
const INK = rgb(0.1, 0.11, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.96, 0.97, 0.98);

export interface RenderOptions {
  /** بايتات خطّ يحمل الحروف العربية (TTF/OTF). */
  fontBytes: Uint8Array | ArrayBuffer;
  /** خطّ عريض للعناوين — يُستعمل الخطُّ نفسه إن غاب. */
  boldFontBytes?: Uint8Array | ArrayBuffer;
  /**
   * المبلغ بالحروف. يُمرَّر من `mutawafiq` أو أي محرّك تفقيط.
   * وإن غاب لم يُطبع السطر — ولا نخترع صياغةً نحوية بأنفسنا هنا.
   */
  amountInWords?: (totalMinor: number, currency: string) => string;
  /** عنوان الصفحة. المبدئي يتبع نوع الفاتورة. */
  title?: string;
}

/** ما نتج عن الرسم — يفيد في الفحص والأرشفة. */
export interface RenderResult {
  pdf: Uint8Array;
  totals: InvoiceTotals;
  /** نصّ Base64 الموضوع في رمز QR، أو `null` إن لم يكن البائع سعودياً. */
  qrPayload: string | null;
}

function line(page: PDFPage, x1: number, y: number, x2: number, color = RULE) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color });
}

/** يرسم رمز QR مربّعات متجهة — لا صورة نقطية، فيبقى حاداً عند أي تكبير. */
function drawQr(page: PDFPage, payload: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const module = size / count;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      page.drawRectangle({
        x: x + col * module,
        y: y + size - (row + 1) * module,
        width: module,
        height: module,
        color: rgb(0, 0, 0),
      });
    }
  }
}

/** سطرٌ عربي مُحاذى إلى اليمين عند `right`. */
function rtl(page: PDFPage, text: string, right: number, y: number,
             font: PDFFont, size: number, color: RGB = INK) {
  drawArabicText(page, text, { font, size, x: right, y, color, align: "right", base: "rtl" });
}

/** سطرٌ يساري — للأرقام اللاتينية المستقلة. */
function ltr(page: PDFPage, text: string, left: number, y: number,
             font: PDFFont, size: number, color: RGB = INK) {
  drawArabicText(page, text, { font, size, x: left, y, color, align: "left", base: "ltr" });
}

/**
 * يبني ملف الفاتورة.
 *
 * رمز QR يُبنى فقط حين يحمل البائع رقماً ضريبياً سعودياً (15 رقماً يبدأ
 * بـ3) — فوضعُ رمزٍ بمواصفة الهيئة على فاتورة غير سعودية ادعاءُ امتثالٍ
 * لا معنى له.
 */
export async function renderInvoice(invoice: Invoice, options: RenderOptions): Promise<RenderResult> {
  const totals = computeTotals(invoice);

  const doc = await PDFDocument.create();
  // fontkit يُسجَّل من طرف المستدعي في المتصفح؛ وفي Node نستورده كسولاً
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  doc.registerFontkit(fontkit);

  const font = await doc.embedFont(options.fontBytes as Uint8Array, { subset: false });
  const bold = options.boldFontBytes
    ? await doc.embedFont(options.boldFontBytes as Uint8Array, { subset: false })
    : font;

  const page = doc.addPage(A4);
  const right = A4[0] - MARGIN;
  const left = MARGIN;
  let y = A4[1] - MARGIN;

  // ── الترويسة ─────────────────────────────────────────────────────────
  const simplified = invoice.kind !== "standard";
  const title = options.title ?? (simplified ? "فاتورة ضريبية مبسطة" : "فاتورة ضريبية");
  rtl(page, title, right, y - 18, bold, 20);
  ltr(page, simplified ? "Simplified Tax Invoice" : "Tax Invoice", left, y - 16, font, 10, MUTED);
  y -= 34;
  line(page, left, y, right);
  y -= 22;

  // ── البائع والمشتري ──────────────────────────────────────────────────
  const columnGap = 18;
  const columnWidth = (right - left - columnGap) / 2;
  const sellerRight = right;
  const buyerRight = left + columnWidth;
  let sellerY = y, buyerY = y;

  rtl(page, "البائع", sellerRight, sellerY, bold, 11, MUTED);
  sellerY -= 16;
  rtl(page, invoice.seller.name, sellerRight, sellerY, bold, 12);
  sellerY -= 15;
  if (invoice.seller.vatNumber) {
    rtl(page, `الرقم الضريبي: ${isolate(invoice.seller.vatNumber)}`, sellerRight, sellerY, font, 10, MUTED);
    sellerY -= 14;
  }
  if (invoice.seller.registrationNumber) {
    rtl(page, `السجل التجاري: ${isolate(invoice.seller.registrationNumber)}`, sellerRight, sellerY, font, 10, MUTED);
    sellerY -= 14;
  }
  if (invoice.seller.address) {
    rtl(page, invoice.seller.address, sellerRight, sellerY, font, 10, MUTED);
    sellerY -= 14;
  }

  if (invoice.buyer) {
    rtl(page, "المشتري", buyerRight, buyerY, bold, 11, MUTED);
    buyerY -= 16;
    rtl(page, invoice.buyer.name, buyerRight, buyerY, bold, 12);
    buyerY -= 15;
    if (invoice.buyer.vatNumber) {
      rtl(page, `الرقم الضريبي: ${isolate(invoice.buyer.vatNumber)}`, buyerRight, buyerY, font, 10, MUTED);
      buyerY -= 14;
    }
    if (invoice.buyer.address) {
      rtl(page, invoice.buyer.address, buyerRight, buyerY, font, 10, MUTED);
      buyerY -= 14;
    }
  }

  y = Math.min(sellerY, buyerY) - 10;

  // ── رقم الفاتورة وتاريخها ────────────────────────────────────────────
  //
  // التاريخ بالشرطة المائلة عمداً: `2026-09-01` في سياق عربي يُعرض
  // `01-09-2026` بقواعد يونيكود الصحيحة (W4/W6)، بينما `/` تلتحق بالرقم
  // فينجو الترتيب. سلوكٌ مقيس وموثَّق في نَسْق.
  const date = invoice.issuedAt.slice(0, 10).replace(/-/g, "/");
  const time = invoice.issuedAt.slice(11, 19);
  line(page, left, y, right);
  y -= 18;
  rtl(page, `رقم الفاتورة: ${isolate(invoice.number)}`, right, y, font, 11);
  rtl(page, `التاريخ: ${isolate(`${date} ${time}`)}`, buyerRight, y, font, 11);
  y -= 20;

  // ── جدول البنود ──────────────────────────────────────────────────────
  // الأعمدة من اليمين إلى اليسار — البيان أوسعها لأنه النصّ الوحيد الحرّ
  const columns = [
    { title: "البيان",        width: 0.40, align: "right" as const },
    { title: "الكمية",        width: 0.10, align: "right" as const },
    { title: "السعر",         width: 0.16, align: "right" as const },
    { title: "الضريبة",       width: 0.16, align: "right" as const },
    { title: "الإجمالي",      width: 0.18, align: "right" as const },
  ];
  const tableWidth = right - left;
  const edges: number[] = [];
  let cursor = right;
  for (const column of columns) { edges.push(cursor); cursor -= column.width * tableWidth; }
  edges.push(left);

  page.drawRectangle({ x: left, y: y - 20, width: tableWidth, height: 24, color: BAND });
  columns.forEach((column, i) => rtl(page, column.title, edges[i] - 6, y - 14, bold, 10, MUTED));
  y -= 26;

  for (const [index, item] of totals.lines.entries()) {
    if (y < 210) break;                      // مساحة محجوزة للمجاميع والرمز
    // كل خليةٍ رقمية **معزولة**: بلا عزل تتفرّق الأقواس وعلامة النسبة على
    // جانبَي الرقم، فتُطبع «(15% )150.00» بدل «150.00 (15%)». ترتيبٌ صحيح
    // لنصٍّ لم يُعزل — وخطؤنا أن تركنا الجارَ يحكم على ما ليس منه.
    const cells = [
      item.description,
      isolate(String(item.quantity)),
      isolate(formatMinor(item.unitPrice)),
      isolate(`${formatMinor(item.vatAmount)} (${item.vatRate}%)`),
      isolate(formatMinor(item.lineTotalWithVat)),
    ];
    cells.forEach((cell, i) => rtl(page, cell, edges[i] - 6, y - 12, font, 10));
    y -= 22;
    if (index < totals.lines.length - 1) line(page, left, y + 6, right, rgb(0.93, 0.94, 0.96));
  }

  line(page, left, y + 4, right);
  y -= 12;

  // ── المجاميع ─────────────────────────────────────────────────────────
  const labelRight = right;
  const valueRight = right - 150;
  const money = (amount: number) => isolate(`${formatMinor(amount)} ${invoice.currency}`);
  const rows: Array<[string, string, boolean]> = [
    ["المجموع قبل الضريبة", money(totals.subtotal), false],
    ...totals.vatByRate.map((v) =>
      [`ضريبة القيمة المضافة ${isolate(`(${v.rate}%)`)}`, money(v.vat), false] as [string, string, boolean]),
    ["الإجمالي شامل الضريبة", money(totals.total), true],
  ];
  for (const [label, value, emphasis] of rows) {
    rtl(page, label, labelRight, y, emphasis ? bold : font, emphasis ? 12 : 11, emphasis ? INK : MUTED);
    rtl(page, value, valueRight, y, emphasis ? bold : font, emphasis ? 12 : 11);
    y -= emphasis ? 22 : 18;
  }

  // ── المبلغ بالحروف ───────────────────────────────────────────────────
  if (options.amountInWords) {
    const words = options.amountInWords(totals.total, invoice.currency);
    if (words?.trim()) {
      y -= 4;
      const width = measureArabicText(`فقط ${words} لا غير`, font, 10.5, "rtl");
      page.drawRectangle({
        x: right - width - 10, y: y - 6, width: width + 16, height: 22, color: BAND,
      });
      rtl(page, `فقط ${words} لا غير`, right - 2, y, font, 10.5);
      y -= 26;
    }
  }

  // ── رمز QR ───────────────────────────────────────────────────────────
  let qrPayload: string | null = null;
  const vat = invoice.seller.vatNumber?.trim() ?? "";
  if (/^3\d{14}$/.test(vat)) {
    qrPayload = encodeZatcaQr({
      sellerName: invoice.seller.name,
      vatNumber: vat,
      timestamp: invoice.issuedAt,
      totalWithVat: formatMinor(totals.total).replace(/,/g, ""),
      vatAmount: formatMinor(totals.vatTotal).replace(/,/g, ""),
    });
    const size = 96;
    drawQr(page, qrPayload, left, MARGIN + 26, size);
    ltr(page, "ZATCA Phase 1", left, MARGIN + 12, font, 8, MUTED);
  }

  if (invoice.notes?.trim()) rtl(page, invoice.notes.trim(), right, MARGIN + 96, font, 9.5, MUTED);

  line(page, left, MARGIN + 6, right);

  return { pdf: await doc.save(), totals, qrPayload };
}

export { StandardFonts };

/**
 * مثال كامل: فاتورة ضريبية مبسطة، بمبلغها بالحروف ورمزها.
 *
 *   node invoice-pdf/examples/sample.mjs [مسار الخط] [مسار الخرج]
 *
 * الخطّ يُمرَّر ولا يُضمَّن في الحزمة — للخطوط رخصها.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { renderInvoice } from "../dist/index.js";

const FONT = process.argv[2] ?? ["C:/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find(existsSync);
const OUT = process.argv[3] ?? "invoice-sample.pdf";
if (!FONT) { console.error("مرّر مسار خطّ عربي كأول وسيط"); process.exit(1); }

/** محرّك تفقيط بسيط للمثال — استعمل مُتوافِق في الإنتاج. */
const words = (minor, currency) => {
  const riyals = Math.floor(minor / 100), halalas = minor % 100;
  const unit = currency === "SAR" ? "ريالاً سعودياً" : currency;
  return halalas ? `${riyals} ${unit} و${halalas} هللة` : `${riyals} ${unit}`;
};

const { pdf, totals, qrPayload } = await renderInvoice({
  number: "INV-2026-0042",
  issuedAt: "2026-09-01T13:45:00+03:00",
  currency: "SAR",
  kind: "simplified",
  seller: {
    name: "مؤسسة الأمل التجارية",
    vatNumber: "310122393500003",
    registrationNumber: "1010123456",
    address: "الرياض — طريق الملك فهد",
  },
  buyer: { name: "شركة المستقبل للتقنية" },
  lines: [
    { description: "استشارة برمجية (ساعتان)", quantity: 2, unitPrice: 50000, vatRate: 15 },
    { description: "ترخيص سنوي — نظام الفوترة", quantity: 1, unitPrice: 34500, vatRate: 15 },
    { description: "شحن (معفى)", quantity: 1, unitPrice: 2500, vatRate: 0 },
  ],
  notes: "الدفع خلال 14 يوماً من تاريخ الإصدار.",
}, { fontBytes: readFileSync(FONT), amountInWords: words });

writeFileSync(OUT, Buffer.from(pdf));
console.log(`✓ ${OUT}`);
console.log(`  الإجمالي : ${(totals.total / 100).toFixed(2)} SAR`);
console.log(`  الضريبة  : ${(totals.vatTotal / 100).toFixed(2)} SAR`);
console.log(`  رمز QR   : ${qrPayload ? qrPayload.slice(0, 48) + "…" : "لا يوجد"}`);

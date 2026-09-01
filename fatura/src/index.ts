/**
 * فاتورة ضريبية عربية بصيغة PDF — نصٌّ صحيح، ومجاميع بالهللات، ورمز QR
 * مبنيّ على نصّ مواصفة الهيئة.
 */
export { renderInvoice, type RenderOptions, type RenderResult } from "./render.js";
export {
  computeTotals,
  formatMinor,
  type Invoice,
  type InvoiceLine,
  type InvoiceTotals,
  type ComputedLine,
  type Party,
  type Minor,
} from "./model.js";
export {
  buildZatcaTlv,
  encodeZatcaQr,
  decodeZatcaQr,
  validateZatcaFields,
  MAX_QR_BASE64_LENGTH,
  MAX_TLV_VALUE_BYTES,
  type ZatcaQrFields,
  type DecodedTlv,
} from "./zatca-qr.js";

/**
 * نَسْق — نصّ عربي صحيح في PDF.
 *
 * السطح العام معرَّف هنا صراحةً؛ ما لم يُذكر تفصيلٌ داخلي يجوز أن يتغيّر.
 * ومُهايئ `pdf-lib` في مدخلٍ منفصل (`nasq/pdf-lib`) حتى لا يفرض التبعية
 * على من يستعمل المقاطع مع محرّك رسمٍ آخر.
 */
export {
  resolveRuns,
  paragraphDirection,
  mirror,
  type DirectionalRun,
  type BaseDirection,
} from "./runs.js";

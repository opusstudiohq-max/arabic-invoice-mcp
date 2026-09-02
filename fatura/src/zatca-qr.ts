/**
 * رمز QR للفاتورة الإلكترونية السعودية — المرحلة الأولى (الوسوم 1-5).
 *
 * ### المصدر
 *
 * منقول عن **نصّ المواصفة** لا عن عيّنة:
 * ZATCA — *Electronic Invoice Security Features Implementation Standards*
 * v1.1، §4.1 والجدول 3، الصفحتان 25-26.
 *
 * وسببُ هذا التشديد قصّة: ذهبنا نتحقق من نسخة بايثون بعيّنة Base64
 * «رسمية» مستعادة من الذاكرة، فلم تُطابق. وقبل تعديل الكود فُكِّكت العيّنة
 * نفسها فإذا هي **فاسدة** — تُعلن الوسم 4 بطول 6 ثم لا ينتظم ما بعدها
 * TLV. كان المرجع خاطئاً والتطبيق سليماً.
 *
 * ### الخطوات كما تنصّ عليها المواصفة
 *
 * ①  الوسم: بايت واحد
 * ②  الطول: عدد بايتات **ترميز UTF-8** للقيمة، في بايت واحد
 * ③  القيمة: بايتات UTF-8
 * ④  تُسلسَل الثلاثيات ثم تُرمَّز Base64، وحدّ الناتج **700 حرفاً**
 *
 * ### الفخّ الذي يُسقط كل تطبيق ساذج
 *
 * الطول **بالبايتات لا بالأحرف**. «شركة» أربعة أحرف وثمان بايتات، ومن عدّ
 * الأحرف أنتج رمزاً يفشل قارئه بلا رسالة تشخيص.
 *
 * ### ما ليس هنا
 *
 * الوسوم 6-9 (هاش XML، توقيع ECDSA، المفتاح العام، توقيع الهيئة للفواتير
 * المبسطة) تخصّ المرحلة الثانية وتلزم من ربطته الهيئة بمنصة «فاتورة».
 * ولا تُبنى بلا شهادة ختمٍ حقيقية، ولن نشحن كوداً لم يُشغَّل عليها.
 */

/** حدّ طول نصّ Base64 كما تنصّ المواصفة، §4.1. */
export const MAX_QR_BASE64_LENGTH = 700;

/**
 * أقصى طول قيمةٍ يُمثَّل — بقواعد BER، لا ببايتٍ واحد.
 *
 * كان هذا الثابت 255، لأن نصّ المواصفة يقول «The length shall be stored in
 * one byte». **وذلك تبسيطٌ ينكسر عند 128 بايتاً**، وكان يُنتج رمزاً يرفضه
 * مُحقِّق الهيئة.
 */
export const MAX_TLV_VALUE_BYTES = 0xFFFF;

export interface ZatcaQrFields {
  /** الوسم 1 — اسم البائع. */
  sellerName: string;
  /** الوسم 2 — الرقم الضريبي: 15 رقماً يبدأ بـ3 وينتهي بـ3. */
  vatNumber: string;
  /** الوسم 3 — تاريخ ووقت الفاتورة بصيغة ISO 8601 مع منطقة زمنية. */
  timestamp: string;
  /** الوسم 4 — الإجمالي شامل الضريبة، نصّاً كما يُطبع. */
  totalWithVat: string;
  /** الوسم 5 — مبلغ الضريبة، نصّاً كما يُطبع. */
  vatAmount: string;
}

const ISO8601 = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * ترميز الطول بقواعد BER.
 *
 * ### لماذا، وقد كان الكود يقول «بايت واحد»
 *
 * نصّ المواصفة يقول: «The length shall be stored in one byte» — وهو
 * **تبسيطٌ ينكسر عند 128 بايتاً**. والحسم من منتدى الهيئة نفسه، في موضوع
 * «QR Code Rejected When Tag 1 Exceeds 127 Characters»، وبنصّ صاحب
 * المشكلة بعد إصلاحها:
 *
 *     «our code assumed that the maximum length of the value is 1 byte and
 *      therefore when the value was bigger than 127, we were not properly
 *      convert it to TLV value»
 *
 * https://zatca1.discourse.group/t/qr-code-rejected-when-tag-1-company-name-exceeds-127-characters/7202
 *
 *     الطول < 128        بايتٌ واحد يحمله
 *     128 ≤ الطول ≤ 255  `0x81` ثم بايت الطول
 *     256 ≤ الطول        `0x82` ثم بايتان بترتيب كبير-أولاً
 *
 * **وحدُّ 128 يبلغه اسمٌ عربي من 64 حرفاً** — فالحرف العربي بايتان. وذاك
 * اسمُ منشأةٍ سعودية عادي الطول، لا حالةٌ حدّية مصطنعة.
 */
function berLength(length: number): number[] {
  if (length < 0x80) return [length];
  if (length <= 0xFF) return [0x81, length];
  if (length <= 0xFFFF) return [0x82, length >> 8, length & 0xFF];
  throw new RangeError(`طول القيمة ${length} بايتاً يتجاوز ما يُمثَّل في رمز QR`);
}

/** ثلاثية TLV واحدة: وسم، طول بالبايتات (BER)، قيمة. */
function tlv(tag: number, value: string): Uint8Array {
  const payload = new TextEncoder().encode(value);
  const header = [tag, ...berLength(payload.length)];
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

/**
 * التحقق من الحقول قبل الترميز.
 *
 * نرفض المدخل الخاطئ ولا نُصلحه: رمزٌ مبنيّ على رقمٍ ضريبي مخترَع يمرّ
 * بصمت ويُرفض عند الفحص، والرفض هنا أرحم.
 */
export function validateZatcaFields(fields: ZatcaQrFields): string[] {
  const problems: string[] = [];
  if (!fields.sellerName?.trim()) problems.push("اسم البائع مطلوب (الوسم 1)");
  const vat = fields.vatNumber?.trim() ?? "";
  if (!/^\d{15}$/.test(vat)) problems.push(`الرقم الضريبي يجب أن يكون 15 رقماً — الحالي «${vat}»`);
  else if (!vat.startsWith("3")) problems.push("الرقم الضريبي السعودي يبدأ بالرقم 3");
  if (!ISO8601.test(fields.timestamp?.trim() ?? "")) {
    problems.push(`التاريخ يجب أن يكون ISO 8601 مع منطقة زمنية — الحالي «${fields.timestamp}»`);
  }
  if (!fields.totalWithVat?.trim()) problems.push("الإجمالي مطلوب (الوسم 4)");
  if (!fields.vatAmount?.trim()) problems.push("مبلغ الضريبة مطلوب (الوسم 5)");
  return problems;
}

/** مصفوفة بايتات TLV للوسوم 1-5 بترتيبها. */
export function buildZatcaTlv(fields: ZatcaQrFields): Uint8Array {
  const problems = validateZatcaFields(fields);
  if (problems.length) throw new Error(problems.join("؛ "));

  const parts = [
    tlv(1, fields.sellerName.trim()),
    tlv(2, fields.vatNumber.trim()),
    tlv(3, fields.timestamp.trim()),
    tlv(4, fields.totalWithVat.trim()),
    tlv(5, fields.vatAmount.trim()),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** ترميز Base64 يعمل في Node وفي المتصفح — الأداة تُشحن للاثنين. */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** نصّ Base64 الذي يُوضع في رمز QR. */
export function encodeZatcaQr(fields: ZatcaQrFields): string {
  const encoded = toBase64(buildZatcaTlv(fields));
  if (encoded.length > MAX_QR_BASE64_LENGTH) {
    throw new RangeError(
      `ناتج QR ${encoded.length} حرفاً ويتجاوز سقف المواصفة (${MAX_QR_BASE64_LENGTH})`,
    );
  }
  return encoded;
}

/** ثلاثية مفكوكة من رمزٍ قائم. */
export interface DecodedTlv {
  tag: number;
  value: string;
}

/**
 * فكّ رمزٍ قائم — يفيد في فحص رموز الغير وفي اختبار الذهاب والإياب.
 *
 * ⚠️ يفكّ الوسوم النصّية. الوسوم 6-9 ثنائية (هاش وتواقيع) فتُعاد بصيغة
 * سداسية عشرية، ولا يُزعم فحصها.
 */
export function decodeZatcaQr(base64: string): DecodedTlv[] {
  const raw = typeof Buffer !== "undefined"
    ? new Uint8Array(Buffer.from(base64, "base64"))
    : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const out: DecodedTlv[] = [];
  let i = 0;
  while (i < raw.length) {
    if (i + 2 > raw.length) throw new Error(`ثلاثية مبتورة عند البايت ${i}`);
    const tag = raw[i];

    // الطول بقواعد BER — والفكّ ببايتٍ واحد يقرأ `0x81` طولاً قدره 129
    // فيُنتج قيمةً مبتورة بلا شكوى.
    let length = raw[i + 1];
    let header = 2;

    // **الفكُّ المتساهل يُبارك العيب بدل أن يكشفه.**
    //
    // كان يقرأ `0x80` طولاً قدره 128 فينجح ولا يشتكي. و`0x80` في موضع
    // الطول ليس 128 في BER، بل **الطول غير المحدَّد** ولا يجوز هنا. وهو
    // ما يُنتجه مُشفّرٌ يكتب الطول في بايتٍ واحد عند 128 بايتاً — أي عند
    // اسمٍ عربي من 64 حرفاً، وهو أشهر سبب لرفض الرمز عند الهيئة.
    //
    // فمن استعمل هذا الفاكّ ليتحقق من رمزٍ **مرفوض** كان يُطمأن إليه.
    // وقِيس ذلك على الأداة المنشورة أولاً، ثم وُجد هنا.
    if (length === 0x80) {
      throw new Error(
        `الوسم ${tag}: بايت الطول 0x80 — القيمة 128 بايتاً لا تُكتب في بايتٍ ` +
        `واحد. الصواب 0x81 ثم 0x80.`,
      );
    }
    if (length === 0xEF && raw[i + 2] === 0xBF && raw[i + 3] === 0xBD) {
      throw new Error(
        `الوسم ${tag}: موضع الطول يحمل EF BF BD — محرف الاستبدال U+FFFD. ` +
        `الطول مرّ بترميز نصّي فضاع.`,
      );
    }
    if (length > 0x82) {
      throw new Error(
        `الوسم ${tag}: بايت الطول 0x${length.toString(16)} غير صالح — ` +
        `المسموح بايتٌ دون 0x80، أو 0x81، أو 0x82.`,
      );
    }

    if (length === 0x81) {
      length = raw[i + 2];
      header = 3;
    } else if (length === 0x82) {
      length = (raw[i + 2] << 8) | raw[i + 3];
      header = 4;
    }

    if (length === 0 && tag <= 5) {
      throw new Error(
        `الوسم ${tag}: الطول المُعلن صفر — يقع حين يُكتب طولٌ يتجاوز 255 في ` +
        `بايتٍ واحد فيُبتر. الصواب 0x82 ثم بايتان.`,
      );
    }

    if (i + header + length > raw.length) {
      throw new Error(`الوسم ${tag} يعلن طول ${length} ويتجاوز نهاية البيانات`);
    }
    const slice = raw.subarray(i + header, i + header + length);
    out.push({
      tag,
      value: tag >= 6
        ? Array.from(slice).map((b) => b.toString(16).padStart(2, "0")).join("")
        : new TextDecoder("utf-8").decode(slice),
    });
    i += header + length;
  }
  return out;
}

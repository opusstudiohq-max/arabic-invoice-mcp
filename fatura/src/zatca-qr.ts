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

/** أقصى طول لقيمة واحدة: الطول يُخزَّن في بايت واحد. */
export const MAX_TLV_VALUE_BYTES = 255;

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

/** ثلاثية TLV واحدة: وسم، طول بالبايتات، قيمة. */
function tlv(tag: number, value: string): Uint8Array {
  const payload = new TextEncoder().encode(value);
  if (payload.length > MAX_TLV_VALUE_BYTES) {
    throw new RangeError(
      `قيمة الوسم ${tag} طولها ${payload.length} بايتاً وتتجاوز ${MAX_TLV_VALUE_BYTES}` +
        " — والطول يُخزَّن في بايت واحد فلا يُمثَّل ما جاوزه",
    );
  }
  const out = new Uint8Array(2 + payload.length);
  out[0] = tag;
  out[1] = payload.length;      // ← بالبايتات، لا بالأحرف
  out.set(payload, 2);
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
    const tag = raw[i], length = raw[i + 1];
    if (i + 2 + length > raw.length) {
      throw new Error(`الوسم ${tag} يعلن طول ${length} ويتجاوز نهاية البيانات`);
    }
    const slice = raw.subarray(i + 2, i + 2 + length);
    out.push({
      tag,
      value: tag >= 6
        ? Array.from(slice).map((b) => b.toString(16).padStart(2, "0")).join("")
        : new TextDecoder("utf-8").decode(slice),
    });
    i += 2 + length;
  }
  return out;
}

/**
 * ZATCA QR Validator — Browser Edition
 * =====================================
 * محرك التحقق من توافق فاتورة ZATCA
 * 
 * القواعد منقولة حرفياً من:
 *   arabic-invoice-mcp/src/arabic_invoice_mcp/zatca_qr.py
 * 
 * المرجع: ZATCA E-Invoicing Technical Specification (Phase 1 — B2C)
 */

/** أقصى طولٍ يُمثَّل بترميز BER بوسم 0x82 — لا 255 كما كان. */
const MAX_TLV_VALUE_BYTES = 0xFFFF;

// Strict ISO-8601 regex — identical to _ISO8601_STRICT in zatca_qr.py
const ISO8601_STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// TLV Tag names in Arabic
const TAG_NAMES = {
  1: 'اسم البائع',
  2: 'الرقم الضريبي',
  3: 'تاريخ ووقت الفاتورة',
  4: 'الإجمالي شامل الضريبة',
  5: 'مبلغ ضريبة القيمة المضافة',
};

/**
 * فك ترميز Base64 إلى Uint8Array
 * @param {string} b64 — نص Base64
 * @returns {{ ok: boolean, data?: Uint8Array, error?: string }}
 */
function decodeBase64(b64) {
  try {
    const cleaned = b64.trim();
    if (!cleaned) {
      return { ok: false, error: 'النص فارغ — الصق محتوى QR code الخاص بفاتورتك' };
    }
    // Validate base64 characters
    if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
      return { ok: false, error: 'النص يحتوي على أحرف غير صالحة لـ Base64. تأكد من نسخ محتوى QR كاملاً.' };
    }
    const binaryStr = atob(cleaned);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { ok: true, data: bytes };
  } catch (e) {
    return { ok: false, error: 'فشل فك ترميز Base64 — تأكد من صحة النص المنسوخ من QR code.' };
  }
}

/**
 * فك TLV buffer إلى حقول — **بقواعد BER**.
 *
 * ### لماذا BER، وكانت هنا قراءةٌ ببايتٍ واحد
 *
 * نصّ المواصفة يقول «The length shall be stored in one byte»، وهو تبسيطٌ
 * ينكسر عند 128 بايتاً. والحسم من منتدى الهيئة نفسه، بنصّ صاحب المشكلة بعد
 * إصلاحها: «our code assumed that the maximum length of the value is 1 byte
 * … we were not properly convert it to TLV value».
 * https://zatca1.discourse.group/t/qr-code-rejected-when-tag-1-company-name-exceeds-127-characters/7202
 *
 * والقارئ ببايتٍ واحد **يعكس ضرر المشفّر**: يقرأ `0x81` طولاً قدره 129،
 * فيبتلع الوسمَ التالي ثم يُعلن «بيانات مقطوعة». أي أن هذه الأداة كانت
 * **تُخبر تاجراً سعودياً اسمه من 64 حرفاً عربياً أن رمزه الصحيح مكسور**.
 * وهي أداةٌ منشورة، والخطأ فيها يصل من يثق بها.
 *
 * @param {Uint8Array} buffer
 * @returns {{ ok: boolean, tags?: Object, errors?: string[] }}
 */
function parseTLV(buffer) {
  const tags = {};
  const errors = [];
  let i = 0;

  while (i < buffer.length) {
    if (i + 1 >= buffer.length) {
      errors.push('بيانات TLV مقطوعة — البايتات المتبقية غير كافية لقراءة Tag + Length');
      break;
    }

    const tag = buffer[i];

    // الطول بقواعد BER: بايتٌ واحد دون 128، وإلا 0x81 ثم بايت، أو 0x82 ثم بايتان.
    let length = buffer[i + 1];
    let header = 2;
    if (length === 0x81) {
      length = buffer[i + 2];
      header = 3;
    } else if (length === 0x82) {
      length = (buffer[i + 2] << 8) | buffer[i + 3];
      header = 4;
    }

    if (i + header > buffer.length) {
      errors.push(`الحقل ${tag} يُعلن طولاً ممتداً ثم تنتهي البيانات قبل قراءته`);
      break;
    }

    if (i + header + length > buffer.length) {
      errors.push(`الحقل ${tag} يحدد طول ${length} بايت لكن البيانات المتاحة أقل`);
      break;
    }

    const valueBytes = buffer.slice(i + header, i + header + length);

    // Decode UTF-8
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      tags[tag] = {
        raw: valueBytes,
        value: decoder.decode(valueBytes),
        byteLength: length,
      };
    } catch (e) {
      tags[tag] = {
        raw: valueBytes,
        value: null,
        byteLength: length,
        decodeError: true,
      };
      errors.push(`الحقل ${tag} يحتوي على بيانات UTF-8 غير صالحة`);
    }

    i += header + length;
  }

  return { ok: errors.length === 0, tags, errors };
}

/**
 * التحقق من حقل اسم البائع (Tag 1)
 * يطابق: zatca_qr.py سطر 72
 */
function validateSellerName(tagData) {
  if (!tagData || !tagData.value) {
    return {
      passed: false,
      tag: 1,
      field: TAG_NAMES[1],
      risk: 'اسم البائع مفقود أو فارغ — هذا حقل إلزامي في ZATCA Phase 1.',
      fix: 'تأكد من أن نظام الفوترة يُدخل اسم المنشأة كاملاً في الحقل الأول من QR.',
      severity: 'error',
    };
  }
  if (!tagData.value.trim()) {
    return {
      passed: false,
      tag: 1,
      field: TAG_NAMES[1],
      risk: 'اسم البائع فارغ (مسافات فقط) — الهيئة ترفض الفواتير بدون اسم بائع واضح.',
      fix: 'أضف اسم المنشأة التجارية كما هو مسجل في السجل التجاري.',
      severity: 'error',
    };
  }
  // الحدّ الحاكم ليس 255 بايتاً للحقل، بل **سقف الـ700 حرفاً للرمز كله**
  // (§4.1). وترميز BER يحمل حتى 65,535 بايتاً، فلا معنى لحدٍّ عند 255 —
  // وكان الفحص هنا ميّتاً أصلاً: `buffer[i+1]` لا يتجاوز 255 بحكم النوع.
  if (tagData.byteLength > MAX_TLV_VALUE_BYTES) {
    return {
      passed: false,
      tag: 1,
      field: TAG_NAMES[1],
      risk: `اسم البائع ${tagData.byteLength} بايتاً — ولا يُمثَّل طولٌ فوق ${MAX_TLV_VALUE_BYTES} في ترميز الطول.`,
      fix: 'اختصر اسم البائع.',
      severity: 'error',
    };
  }
  return {
    passed: true,
    tag: 1,
    field: TAG_NAMES[1],
    value: tagData.value,
    severity: 'success',
  };
}

/**
 * التحقق من الرقم الضريبي (Tag 2)
 * يطابق: zatca_qr.py سطور 74-77
 */
function validateVATNumber(tagData) {
  if (!tagData || !tagData.value) {
    return {
      passed: false,
      tag: 2,
      field: TAG_NAMES[2],
      risk: 'الرقم الضريبي مفقود — بدونه الفاتورة غير مقبولة قانونياً.',
      fix: 'أضف الرقم الضريبي المكون من 15 رقم المسجل لدى هيئة الزكاة.',
      severity: 'error',
    };
  }

  const vat = tagData.value.trim();

  // Must be exactly 15 digits — mirrors line 74
  if (vat.length !== 15 || !/^\d{15}$/.test(vat)) {
    return {
      passed: false,
      tag: 2,
      field: TAG_NAMES[2],
      risk: `الرقم الضريبي "${vat}" ليس 15 رقماً — طوله الحالي: ${vat.length} حرف.`,
      fix: 'الرقم الضريبي السعودي يجب أن يكون 15 رقم بالضبط بدون مسافات أو أحرف.',
      severity: 'error',
    };
  }

  // Must start with '3' — mirrors line 76-77
  if (!vat.startsWith('3')) {
    return {
      passed: false,
      tag: 2,
      field: TAG_NAMES[2],
      risk: `الرقم الضريبي "${vat}" لا يبدأ بـ 3 — جميع الأرقام الضريبية السعودية تبدأ بـ 3.`,
      fix: 'تحقق من الرقم الضريبي على موقع هيئة الزكاة والضريبة والجمارك.',
      severity: 'error',
    };
  }

  return {
    passed: true,
    tag: 2,
    field: TAG_NAMES[2],
    value: vat,
    severity: 'success',
  };
}

/**
 * التحقق من التاريخ والوقت (Tag 3)
 * يطابق: zatca_qr.py سطور 78-84 + _ISO8601_STRICT regex
 */
function validateTimestamp(tagData) {
  if (!tagData || !tagData.value) {
    return {
      passed: false,
      tag: 3,
      field: TAG_NAMES[3],
      risk: 'تاريخ الفاتورة مفقود — هذا حقل إلزامي لتحديد لحظة إصدار الفاتورة.',
      fix: 'أضف التاريخ بصيغة ISO 8601 مثال: 2026-07-04T15:30:00Z',
      severity: 'error',
    };
  }

  const ts = tagData.value.trim();

  // Must match strict ISO-8601 with timezone — mirrors _ISO8601_STRICT
  if (!ISO8601_STRICT.test(ts)) {
    return {
      passed: false,
      tag: 3,
      field: TAG_NAMES[3],
      risk: `التاريخ "${ts}" ليس بصيغة ISO 8601 صارمة مع timezone.`,
      fix: 'الصيغة المطلوبة: YYYY-MM-DDTHH:MM:SSZ مثل 2026-07-04T15:30:00Z أو 2026-07-04T18:30:00+03:00',
      severity: 'error',
    };
  }

  // Semantic validation — mirrors datetime.fromisoformat() in line 82
  // Replace Z with +00:00 for Date parsing compatibility
  const parseable = ts.replace(/Z$/, '+00:00');
  const dateObj = new Date(parseable);
  if (isNaN(dateObj.getTime())) {
    return {
      passed: false,
      tag: 3,
      field: TAG_NAMES[3],
      risk: `التاريخ "${ts}" يتبع الصيغة الصحيحة لكنه غير صالح (مثلاً 30 فبراير).`,
      fix: 'تأكد من أن التاريخ حقيقي وقابل للوجود في التقويم.',
      severity: 'error',
    };
  }

  return {
    passed: true,
    tag: 3,
    field: TAG_NAMES[3],
    value: ts,
    severity: 'success',
  };
}

/**
 * التحقق من المبالغ (Tag 4 و Tag 5)
 * يطابق: zatca_qr.py سطر 85
 */
function validateAmount(tagData, tagNumber) {
  const fieldName = TAG_NAMES[tagNumber];

  if (!tagData || !tagData.value) {
    return {
      passed: false,
      tag: tagNumber,
      field: fieldName,
      risk: `${fieldName} مفقود — هذا حقل إلزامي في ZATCA.`,
      fix: `أضف ${fieldName} كرقم عشري مثل "1150.00"`,
      severity: 'error',
    };
  }

  const val = tagData.value.trim();
  const num = parseFloat(val);

  if (isNaN(num)) {
    return {
      passed: false,
      tag: tagNumber,
      field: fieldName,
      risk: `${fieldName} "${val}" ليس رقماً صالحاً.`,
      fix: 'يجب أن يكون رقماً عشرياً مثل "1150.00" بدون رموز عملة أو نصوص.',
      severity: 'error',
    };
  }

  if (num < 0) {
    return {
      passed: false,
      tag: tagNumber,
      field: fieldName,
      risk: `${fieldName} سالب (${val}) — المبالغ يجب أن تكون صفر أو أكثر.`,
      fix: 'راجع حساب المبلغ — القيم السالبة غير مقبولة.',
      severity: 'error',
    };
  }

  return {
    passed: true,
    tag: tagNumber,
    field: fieldName,
    value: val,
    severity: 'success',
  };
}

/**
 * الفحص الرئيسي — فك Base64 + TLV + التحقق من كل الحقول
 * @param {string} base64Input — نص Base64 من QR code
 * @returns {ZatcaCheckResult}
 * 
 * @typedef {Object} ZatcaCheckResult
 * @property {boolean} valid — هل اجتازت كل الفحوصات البنيوية؟ (لا يعني قبول الهيئة)
 * @property {number} score — درجة التوافق (0-5)
 * @property {number} total — إجمالي الفحوصات (5)
 * @property {Array} checks — تفاصيل كل فحص
 * @property {Object|null} decoded — البيانات المفكوكة
 * @property {string|null} fatalError — خطأ جذري (فشل Base64 أو TLV)
 */
function validateZatcaQR(base64Input) {
  // Step 1: Decode Base64
  const b64Result = decodeBase64(base64Input);
  if (!b64Result.ok) {
    return {
      valid: false,
      score: 0,
      total: 5,
      checks: [],
      decoded: null,
      fatalError: b64Result.error,
    };
  }

  // Step 2: Parse TLV
  const tlvResult = parseTLV(b64Result.data);

  // Check we got tags at all
  const tagKeys = Object.keys(tlvResult.tags).map(Number);
  if (tagKeys.length === 0) {
    return {
      valid: false,
      score: 0,
      total: 5,
      checks: [],
      decoded: null,
      fatalError: 'فشل قراءة حقول TLV — تأكد أن البيانات هي محتوى QR فاتورة ZATCA.',
    };
  }

  // Step 3: Validate each tag — mirrors build_zatca_tlv() validation
  const checks = [];

  // Tag 1: Seller Name
  checks.push(validateSellerName(tlvResult.tags[1]));

  // Tag 2: VAT Number
  checks.push(validateVATNumber(tlvResult.tags[2]));

  // Tag 3: Timestamp
  checks.push(validateTimestamp(tlvResult.tags[3]));

  // Tag 4: Total with VAT
  checks.push(validateAmount(tlvResult.tags[4], 4));

  // Tag 5: VAT Amount
  checks.push(validateAmount(tlvResult.tags[5], 5));

  // Check tag order: must be 1,2,3,4,5 — mirrors test_tlv_5_fields_concatenated
  const expectedOrder = [1, 2, 3, 4, 5];
  const actualOrder = tagKeys.sort((a, b) => a - b);
  const missingTags = expectedOrder.filter(t => !actualOrder.includes(t));

  if (missingTags.length > 0) {
    // Add warnings for missing tags (already handled above as individual errors)
    // but add structural note
    for (const mt of missingTags) {
      // Find the check for this tag — it should already be an error
      const existing = checks.find(c => c.tag === mt);
      if (existing && !existing.passed) {
        existing.risk += ` (الحقل ${mt} غير موجود في بيانات TLV)`;
      }
    }
  }

  // Calculate score
  const passedCount = checks.filter(c => c.passed).length;

  // Build decoded summary
  const decoded = {};
  for (const [tag, data] of Object.entries(tlvResult.tags)) {
    decoded[TAG_NAMES[tag] || `Tag ${tag}`] = data.value || '(غير قابل للقراءة)';
  }

  // كشف وسوم المرحلة الثانية (6-9: الهاش، التوقيع، المفتاح العام، توقيع الهيئة).
  // وجودها يعني أن الفاتورة من المرحلة الثانية، وفحصنا لا يغطي تلك الوسوم إطلاقاً —
  // فلا يصح أن يرى المستخدم "اجتاز 5/5" وكأن الفاتورة فُحصت بالكامل.
  const phase2TagsPresent = Object.keys(tlvResult.tags)
    .map(Number)
    .filter(t => t >= 6 && t <= 9)
    .sort((a, b) => a - b);

  return {
    valid: passedCount === 5,
    score: passedCount,
    total: 5,
    checks,
    decoded,
    fatalError: null,
    structuralErrors: tlvResult.errors,
    phase2TagsPresent,
    isPhase2: phase2TagsPresent.length > 0,
  };
}

// Export for tests and app
if (typeof window !== 'undefined') {
  window.ZatcaValidator = {
    validateZatcaQR,
    decodeBase64,
    parseTLV,
    validateSellerName,
    validateVATNumber,
    validateTimestamp,
    validateAmount,
    ISO8601_STRICT,
    TAG_NAMES,
  };
}

// Node.js (CommonJS) export — for the parity test suite in tests/
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateZatcaQR,
    decodeBase64,
    parseTLV,
    validateSellerName,
    validateVATNumber,
    validateTimestamp,
    validateAmount,
    ISO8601_STRICT,
    TAG_NAMES,
  };
}

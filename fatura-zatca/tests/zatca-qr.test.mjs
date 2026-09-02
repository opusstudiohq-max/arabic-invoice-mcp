/**
 * رمز QR — مُثبَّت على **نصّ المواصفة** لا على عيّنة مستعادة.
 *
 * ذهبنا نتحقق من نسخة بايثون بعيّنة Base64 «رسمية» من الذاكرة، فلم تُطابق.
 * وقبل تعديل الكود فُكِّكت العيّنة نفسها فإذا هي **فاسدة**: تُعلن الوسم 4
 * بطول 6 ثم لا ينتظم ما بعدها TLV. المرجع كان خاطئاً والتطبيق سليماً —
 * ولو صُدِّقت الذاكرة لصار الصواب خطأً.
 *
 * ولذلك يُبنى المتوقَّع هنا بمشفّرٍ **مستقل** مكتوب من نصّ §4.1، ويُقارن
 * الناتج بنسخة بايثون المرجعية أيضاً — فمقارنة الكود بنفسه لا تُثبت شيئاً.
 *
 *   node --test invoice-pdf/tests/zatca-qr.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildZatcaTlv, encodeZatcaQr, decodeZatcaQr, validateZatcaFields,
  MAX_QR_BASE64_LENGTH, MAX_TLV_VALUE_BYTES,
} from "../dist/zatca-qr.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// اسم مجلد نسخة بايثون يختلف بين مستودع العمل والمستودع العام — يُجرَّب
// الاثنان، وإلا تخطّى الاختبارُ نفسَه هناك وسقط التكافؤ بلا أثر ظاهر.
const PY_LIB = [
  join(HERE, "..", "..", "arabic-invoice-mcp", "src"),
  join(HERE, "..", "..", "python-lib", "src"),
].find((dir) => existsSync(join(dir, "arabic_invoice_mcp", "zatca_qr.py"))) ?? "";

const CASE = {
  sellerName: "Bobs Records",
  vatNumber: "310122393500003",
  timestamp: "2022-04-25T15:30:00Z",
  totalWithVat: "1000.00",
  vatAmount: "150.00",
};

/** ترجمة حرفية لخطوات §4.1 — لا تستدعي كودنا. */
function independentEncoder(...values) {
  const parts = [];
  values.forEach((value, i) => {
    const payload = Buffer.from(value, "utf-8");
    parts.push(Buffer.from([i + 1, payload.length]), payload);
  });
  return Buffer.concat(parts);
}

test("① يطابق مشفّراً مكتوباً من نصّ المواصفة", () => {
  const expected = independentEncoder(
    CASE.sellerName, CASE.vatNumber, CASE.timestamp, CASE.totalWithVat, CASE.vatAmount);
  assert.deepEqual(Buffer.from(buildZatcaTlv(CASE)), expected);
  assert.equal(encodeZatcaQr(CASE), expected.toString("base64"));
});

test("② يطابق نسخة بايثون المرجعية", (t) => {
  if (!PY_LIB) return t.skip("نسخة بايثون غير موجودة في أيٍّ من التخطيطين");
  const script = `
import sys
sys.path.insert(0, r"${PY_LIB}")
from arabic_invoice_mcp.zatca_qr import encode_zatca_qr
print(encode_zatca_qr(${JSON.stringify(CASE.sellerName)}, ${JSON.stringify(CASE.vatNumber)},
                      ${JSON.stringify(CASE.timestamp)}, ${JSON.stringify(CASE.totalWithVat)},
                      ${JSON.stringify(CASE.vatAmount)}))
`;
  const out = execFileSync("python", ["-c", script], {
    encoding: "utf-8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  }).trim();
  assert.equal(encodeZatcaQr(CASE), out, "النسختان تعطيان رمزين مختلفين");
});

/**
 * الفخّ الذي يُسقط كل تطبيق ساذج: الطول **بالبايتات لا بالأحرف**.
 * ومن عدّ الأحرف أنتج رمزاً يفشل قارئه بلا رسالة تشخيص.
 */
test("③ الطول بعدد بايتات UTF-8 لا بعدد الأحرف", () => {
  const name = "شركة";
  assert.equal(name.length, 4);
  assert.equal(Buffer.from(name, "utf-8").length, 8);
  const tlv = buildZatcaTlv({ ...CASE, sellerName: name });
  assert.equal(tlv[0], 1);
  assert.equal(tlv[1], 8, "الطول كُتب بعدد الأحرف — الرمز سيفشل عند القارئ");
});

test("④ الذهاب والإياب يحفظ القيم", () => {
  const decoded = decodeZatcaQr(encodeZatcaQr({ ...CASE, sellerName: "مؤسسة الأمل التجارية" }));
  assert.deepEqual(decoded.map((d) => d.tag), [1, 2, 3, 4, 5]);
  assert.equal(decoded[0].value, "مؤسسة الأمل التجارية");
  assert.equal(decoded[2].value, CASE.timestamp);
  assert.equal(decoded[4].value, "150.00");
});

test("⑤ سقف الـ700 حاملٌ لا زينة", () => {
  // أقصى TLV للوسوم 1-5 = 5 × (2 + 255) = 1,285 بايتاً ⇒ 1,716 حرفاً Base64
  const worst = Buffer.alloc(5 * (2 + MAX_TLV_VALUE_BYTES)).toString("base64").length;
  assert.ok(worst > MAX_QR_BASE64_LENGTH, `السقف غير بالغ (${worst}) — الفحص ميّت`);
  // وباسمٍ في حدّه وحقولٍ واقعية لا يُبلَغ
  assert.ok(encodeZatcaQr({ ...CASE, sellerName: "ش".repeat(127) }).length <= MAX_QR_BASE64_LENGTH);
});

/**
 * **الاختبار الذي كان يفرض الخطأ.**
 *
 * كان هنا: «ما جاوز 255 بايتاً يُرفض — الطول في بايت واحد»، مأخوذاً من
 * نصّ المواصفة حرفياً. وهو **تبسيطٌ ينكسر عند 128**، وكان يُنتج رمزاً
 * يرفضه مُحقِّق الهيئة.
 *
 * والحسم من منتدى الهيئة، بنصّ صاحب المشكلة بعد إصلاحها: «our code assumed
 * that the maximum length of the value is 1 byte … we were not properly
 * convert it to TLV value».
 * https://zatca1.discourse.group/t/qr-code-rejected-when-tag-1-company-name-exceeds-127-characters/7202
 *
 * فصار الاختبار يفرض **قواعد BER** عند الحدّ بالضبط — لا القاعدة الساذجة.
 */
test("⑥ الطول بقواعد BER عند حدّ 128 بايتاً", () => {
  assert.equal(Buffer.from("ش", "utf-8").length, 2, "الحرف العربي بايتان لا ثلاثة");

  // 63 حرفاً = 126 بايتاً ⇒ بايتٌ واحد يحمله
  const short = buildZatcaTlv({ ...CASE, sellerName: "ش".repeat(63) });
  assert.equal(short[0], 1);
  assert.equal(short[1], 126);

  // 64 حرفاً = 128 بايتاً ⇒ 0x81 ثم الطول. **وهنا كان الكسر.**
  const long = buildZatcaTlv({ ...CASE, sellerName: "ش".repeat(64) });
  assert.equal(long[0], 1);
  assert.equal(long[1], 0x81, "الطول ≥128 يجب أن يُسبق بـ0x81");
  assert.equal(long[2], 128);

  // 128 حرفاً = 256 بايتاً ⇒ 0x82 ثم بايتان
  const huge = buildZatcaTlv({ ...CASE, sellerName: "ش".repeat(128) });
  assert.equal(huge[1], 0x82);
  assert.equal((huge[2] << 8) | huge[3], 256);
});

test("⑥ب الفكّ يقرأ BER فلا يبتر القيمة", () => {
  for (const count of [63, 64, 127, 128, 200]) {
    const name = "ش".repeat(count);
    const decoded = decodeZatcaQr(
      Buffer.from(buildZatcaTlv({ ...CASE, sellerName: name })).toString("base64"));
    assert.equal(decoded[0].value, name, `الاسم بـ${count} حرفاً عاد مبتوراً`);
    assert.deepEqual(decoded.map((d) => d.tag), [1, 2, 3, 4, 5]);
  }
});

test("⑦ المدخل الخاطئ يُرفض ولا يُصلَح بصمت", () => {
  assert.deepEqual(validateZatcaFields(CASE), []);
  assert.ok(validateZatcaFields({ ...CASE, vatNumber: "123" }).length);
  assert.ok(validateZatcaFields({ ...CASE, vatNumber: "410122393500003" }).length, "لا يبدأ بـ3");
  assert.ok(validateZatcaFields({ ...CASE, timestamp: "2022-04-25" }).length, "بلا منطقة زمنية");
  assert.ok(validateZatcaFields({ ...CASE, sellerName: "  " }).length);
});

test("⑧ الرمز المبتور يُشخَّص لا يُبتلع", () => {
  const good = encodeZatcaQr(CASE);
  const truncated = Buffer.from(good, "base64").subarray(0, 10).toString("base64");
  assert.throws(() => decodeZatcaQr(truncated), /مبتورة|يتجاوز/);
});

test("⑨ الوسوم 6-9 تُفكّ سداسياً ولا يُزعم فحصها", () => {
  const phase1 = Buffer.from(encodeZatcaQr(CASE), "base64");
  const hash = Buffer.alloc(32, 0xab);
  const payload = Buffer.concat([phase1, Buffer.from([6, 32]), hash]).toString("base64");
  const decoded = decodeZatcaQr(payload);
  assert.equal(decoded.length, 6);
  assert.equal(decoded[5].tag, 6);
  assert.equal(decoded[5].value, "ab".repeat(32));
});

/**
 * **الفكُّ المتساهل يُبارك العيب بدل أن يكشفه.**
 *
 * قِيس على أداتنا المنشورة أولاً فوُجدت تُصنّف رمزاً بطول `0x80` عند 128
 * بايتاً **«5/5 سليم»** — وهو ما تُنتجه خمسٌ من إحدى عشرة حزمة قِيست، وهو
 * أشهر سبب لرفض الرمز عند الهيئة. ثم وُجد العيب نفسه هنا.
 *
 * ومن استعمل هذا الفاكّ ليتحقق من رمزٍ **مرفوض** كان يُطمأن إليه.
 */
test("⑩ الفكّ يرفض أشكال الطول المكسورة ويُسمّيها", () => {
  const enc = new TextEncoder();
  const build = (lenBytes, chars) => {
    const tlv = (t, v) => { const b = enc.encode(v); return [t, ...lenBytes(b), ...b]; };
    return Buffer.from([
      ...tlv(1, "ش".repeat(chars)), ...tlv(2, CASE.vatNumber),
      ...tlv(3, CASE.timestamp), ...tlv(4, CASE.totalWithVat), ...tlv(5, CASE.vatAmount),
    ]).toString("base64");
  };

  // 0x80 — الطول غير المحدَّد، ولا يجوز هنا
  assert.throws(() => decodeZatcaQr(build((b) => [b.length & 0xFF], 64)), /0x80/);

  // طولٌ بُتر فوق 255
  assert.throws(() => decodeZatcaQr(build((b) => [b.length & 0xFF], 128)), /صفر/);

  // محرف الاستبدال مكان الطول
  assert.throws(
    () => decodeZatcaQr(build((b) => b.length < 0x80 ? [b.length] : [0xEF, 0xBF, 0xBD], 64)),
    /U\+FFFD|EF BF BD/);

  // والسليم يمرّ على الحدّين
  for (const chars of [63, 64, 127, 128, 200]) {
    const ber = (b) => b.length < 0x80 ? [b.length]
      : b.length <= 0xFF ? [0x81, b.length] : [0x82, b.length >> 8, b.length & 0xFF];
    const decoded = decodeZatcaQr(build(ber, chars));
    assert.equal(decoded[0].value, "ش".repeat(chars), `${chars} حرفاً عاد مبتوراً`);
  }
});

/**
 * ZATCA Validator — Self-Tests
 * =============================
 * حالات تحقق مأخوذة من arabic-invoice-mcp/tests/test_zatca_qr.py
 * تعمل في console المتصفح: runTests()
 */

(function () {
  'use strict';

  const V = window.ZatcaValidator;

  /**
   * بناء Base64 TLV يدوياً لأغراض الاختبار
   */
  function buildTestBase64(sellerName, vatNumber, timestamp, totalWithVat, vatAmount) {
    function tlv(tag, valueStr) {
      const encoder = new TextEncoder();
      const valueBytes = encoder.encode(valueStr);
      const result = new Uint8Array(2 + valueBytes.length);
      result[0] = tag;
      result[1] = valueBytes.length;
      result.set(valueBytes, 2);
      return result;
    }

    const parts = [
      tlv(1, sellerName),
      tlv(2, vatNumber),
      tlv(3, timestamp),
      tlv(4, totalWithVat),
      tlv(5, vatAmount),
    ];

    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
    const buffer = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      buffer.set(p, offset);
      offset += p.length;
    }

    // Encode to base64
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  let passed = 0;
  let failed = 0;
  const results = [];

  function assert(condition, testName, detail) {
    if (condition) {
      passed++;
      results.push({ status: '✅', name: testName });
    } else {
      failed++;
      results.push({ status: '❌', name: testName, detail });
    }
  }

  function runTests() {
    passed = 0;
    failed = 0;
    results.length = 0;

    console.log('%c🧪 ZATCA Validator — Self-Tests', 'font-size: 16px; font-weight: bold; color: #22c55e;');
    console.log('━'.repeat(60));

    // ═══════════════════════════════════════════════════════════
    // Test 1: فاتورة سليمة — mirrors test_tlv_basic
    // ═══════════════════════════════════════════════════════════
    const validB64 = buildTestBase64(
      'أوبوس ستوديو',
      '300123456700003',
      '2026-07-04T15:30:00Z',
      '1150.00',
      '150.00'
    );
    const r1 = V.validateZatcaQR(validB64);
    assert(r1.valid === true, 'فاتورة سليمة → متوافقة', `score=${r1.score}`);
    assert(r1.score === 5, 'فاتورة سليمة → درجة 5/5', `score=${r1.score}`);

    // ═══════════════════════════════════════════════════════════
    // Test 2: رقم ضريبي قصير — mirrors test_tlv_validates_vat_number_length
    // ═══════════════════════════════════════════════════════════
    const shortVatB64 = buildTestBase64('شركة', '123', '2026-07-04T15:30:00Z', '1150.00', '150.00');
    const r2 = V.validateZatcaQR(shortVatB64);
    const vatCheck2 = r2.checks.find(c => c.tag === 2);
    assert(vatCheck2 && !vatCheck2.passed, 'رقم ضريبي قصير → خطأ', vatCheck2?.risk);
    assert(vatCheck2 && vatCheck2.risk.includes('15'), 'رقم ضريبي قصير → يذكر "15"', vatCheck2?.risk);

    // ═══════════════════════════════════════════════════════════
    // Test 3: رقم ضريبي يبدأ بـ1 — mirrors test_tlv_validates_vat_prefix
    // ═══════════════════════════════════════════════════════════
    const badPrefixB64 = buildTestBase64('شركة', '100123456700003', '2026-07-04T15:30:00Z', '1150.00', '150.00');
    const r3 = V.validateZatcaQR(badPrefixB64);
    const vatCheck3 = r3.checks.find(c => c.tag === 2);
    assert(vatCheck3 && !vatCheck3.passed, 'رقم ضريبي يبدأ بـ1 → خطأ', vatCheck3?.risk);
    assert(vatCheck3 && vatCheck3.risk.includes('3'), 'رقم ضريبي يبدأ بـ1 → يذكر "3"', vatCheck3?.risk);

    // ═══════════════════════════════════════════════════════════
    // Test 4: timestamp بدون وقت — mirrors test_tlv_validates_timestamp
    // ═══════════════════════════════════════════════════════════
    const noTimeB64 = buildTestBase64('شركة', '300123456700003', '2026-07-04', '1150.00', '150.00');
    const r4 = V.validateZatcaQR(noTimeB64);
    const tsCheck4 = r4.checks.find(c => c.tag === 3);
    assert(tsCheck4 && !tsCheck4.passed, 'timestamp بدون وقت → خطأ', tsCheck4?.risk);
    assert(tsCheck4 && tsCheck4.risk.includes('ISO 8601'), 'timestamp يذكر ISO 8601', tsCheck4?.risk);

    // ═══════════════════════════════════════════════════════════
    // Test 5: اسم بائع فارغ — mirrors test_tlv_validates_seller_name
    // ═══════════════════════════════════════════════════════════
    const emptySellerB64 = buildTestBase64('', '300123456700003', '2026-07-04T15:30:00Z', '1150.00', '150.00');
    const r5 = V.validateZatcaQR(emptySellerB64);
    const sellerCheck5 = r5.checks.find(c => c.tag === 1);
    assert(sellerCheck5 && !sellerCheck5.passed, 'اسم بائع فارغ → خطأ', sellerCheck5?.risk);

    // ═══════════════════════════════════════════════════════════
    // Test 6: فاتورة بتاريخ +03:00 — should pass
    // ═══════════════════════════════════════════════════════════
    const tzOffsetB64 = buildTestBase64(
      'شركة', '300123456700003', '2026-07-04T18:30:00+03:00', '1150.00', '150.00'
    );
    const r6 = V.validateZatcaQR(tzOffsetB64);
    assert(r6.valid === true, 'timestamp مع +03:00 → متوافق', `score=${r6.score}`);

    // ═══════════════════════════════════════════════════════════
    // Test 7: Base64 فارغ — fatal error
    // ═══════════════════════════════════════════════════════════
    const r7 = V.validateZatcaQR('');
    assert(r7.fatalError !== null, 'Base64 فارغ → خطأ جذري');

    // ═══════════════════════════════════════════════════════════
    // Test 8: Base64 غير صالح
    // ═══════════════════════════════════════════════════════════
    const r8 = V.validateZatcaQR('!!!invalid!!!');
    assert(r8.fatalError !== null, 'Base64 غير صالح → خطأ جذري');

    // ═══════════════════════════════════════════════════════════
    // Test 9: ISO-8601 regex matches Python _ISO8601_STRICT
    // ═══════════════════════════════════════════════════════════
    assert(V.ISO8601_STRICT.test('2026-07-04T15:30:00Z'), 'ISO regex: Z timezone → صالح');
    assert(V.ISO8601_STRICT.test('2026-07-04T15:30:00+03:00'), 'ISO regex: +03:00 → صالح');
    assert(V.ISO8601_STRICT.test('2026-07-04T15:30:00.123Z'), 'ISO regex: fractional seconds → صالح');
    assert(!V.ISO8601_STRICT.test('2026-07-04'), 'ISO regex: date only → مرفوض');
    assert(!V.ISO8601_STRICT.test('2026-07-04T15:30:00'), 'ISO regex: no timezone → مرفوض');
    assert(!V.ISO8601_STRICT.test('2026/07/04 15:30:00'), 'ISO regex: slashes → مرفوض');

    // ═══════════════════════════════════════════════════════════
    // Test 10: رقم ضريبي فيه حروف — mirrors test_tlv_validates_vat_is_digits
    // ═══════════════════════════════════════════════════════════
    const alphaVatB64 = buildTestBase64('شركة', '30012345670000X', '2026-07-04T15:30:00Z', '1150.00', '150.00');
    const r10 = V.validateZatcaQR(alphaVatB64);
    const vatCheck10 = r10.checks.find(c => c.tag === 2);
    assert(vatCheck10 && !vatCheck10.passed, 'رقم ضريبي فيه حروف → خطأ');

    // ═══════════════════════════════════════════════════════════
    // Print results
    // ═══════════════════════════════════════════════════════════
    console.log('');
    for (const r of results) {
      const msg = `${r.status} ${r.name}`;
      if (r.status === '✅') {
        console.log(`%c${msg}`, 'color: #22c55e;');
      } else {
        console.log(`%c${msg}`, 'color: #ef4444; font-weight: bold;');
        if (r.detail) console.log(`   → ${r.detail}`);
      }
    }
    console.log('');
    console.log('━'.repeat(60));
    const summary = `النتيجة: ${passed} ✅ نجح | ${failed} ❌ فشل | المجموع: ${passed + failed}`;
    if (failed === 0) {
      console.log(`%c${summary}`, 'color: #22c55e; font-size: 14px; font-weight: bold;');
    } else {
      console.log(`%c${summary}`, 'color: #ef4444; font-size: 14px; font-weight: bold;');
    }

    return { passed, failed, total: passed + failed, results };
  }

  // Expose globally
  window.runTests = runTests;
})();

/**
 * ZATCA Compliance Checker — App Logic
 * =====================================
 * يربط الواجهة بمحرك التحقق ويعرض النتائج
 */

(function () {
  'use strict';

  const V = window.ZatcaValidator;

  // ═══ إعدادات التواصل (يضبطها المالك) ═══
  // FORM_ENDPOINT: أنشئ نموذجاً مجانياً على formspree.io وضع رابطه هنا،
  // مثل: 'https://formspree.io/f/XXXXXXXX'. لو تُرك فارغاً تُستخدم mailto تلقائياً.
  const FORM_ENDPOINT = '';
  const CONTACT_EMAIL = 'yahya@opus-studio.pro';

  // DOM refs
  const textarea = document.getElementById('qr-input');
  const checkBtn = document.getElementById('check-btn');
  const resultsSection = document.getElementById('results-section');
  const resultsContainer = document.getElementById('results-container');

  // ═══════════════════════════════════════════════════════════
  // Demo data — valid invoice from test_zatca_qr.py
  // ═══════════════════════════════════════════════════════════
  function buildDemoBase64(sellerName, vatNumber, timestamp, totalWithVat, vatAmount) {
    function tlv(tag, val) {
      const enc = new TextEncoder();
      const vb = enc.encode(val);
      const buf = new Uint8Array(2 + vb.length);
      buf[0] = tag;
      buf[1] = vb.length;
      buf.set(vb, 2);
      return buf;
    }
    const parts = [tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestamp), tlv(4, totalWithVat), tlv(5, vatAmount)];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const buffer = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { buffer.set(p, off); off += p.length; }
    let bin = '';
    for (let i = 0; i < buffer.length; i++) bin += String.fromCharCode(buffer[i]);
    return btoa(bin);
  }

  const DEMO_VALID = buildDemoBase64('أوبوس ستوديو', '300123456700003', '2026-07-04T15:30:00Z', '1150.00', '150.00');
  const DEMO_BAD_VAT = buildDemoBase64('شركة النجاح', '100123456700003', '2026-07-04T15:30:00Z', '500.00', '75.00');
  const DEMO_BAD_TS = buildDemoBase64('مؤسسة الريادة', '300123456700003', '2026-07-04', '2300.00', '345.00');

  // Wire demo buttons
  document.getElementById('demo-valid')?.addEventListener('click', () => {
    textarea.value = DEMO_VALID;
    textarea.focus();
  });

  document.getElementById('demo-bad-vat')?.addEventListener('click', () => {
    textarea.value = DEMO_BAD_VAT;
    textarea.focus();
  });

  document.getElementById('demo-bad-ts')?.addEventListener('click', () => {
    textarea.value = DEMO_BAD_TS;
    textarea.focus();
  });

  // ═══════════════════════════════════════════════════════════
  // Main check handler
  // ═══════════════════════════════════════════════════════════
  checkBtn.addEventListener('click', runCheck);

  // Allow Ctrl+Enter
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCheck();
    }
  });

  function runCheck() {
    const input = textarea.value;
    if (!input.trim()) {
      showFatalError('الصق محتوى QR code (Base64) من فاتورتك أولاً', 'يمكنك الحصول على النص من تطبيق مسح QR أو من نظام الفوترة الخاص بك.');
      return;
    }

    // Animate button
    checkBtn.classList.add('loading');
    checkBtn.disabled = true;

    // Small delay for visual feedback
    setTimeout(() => {
      const result = V.validateZatcaQR(input);
      renderResult(result);

      checkBtn.classList.remove('loading');
      checkBtn.disabled = false;

      // Smooth scroll to results
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  }

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  function renderResult(result) {
    resultsSection.classList.add('visible');

    if (result.fatalError) {
      showFatalError(result.fatalError, 'تأكد من نسخ نص QR code كاملاً من الفاتورة.');
      return;
    }

    let html = '';

    // Score circle
    const scoreClass = `score-${result.score}`;
    let labelClass = 'fail';
    let labelText = '❌ لم يجتز الفحوصات البنيوية';
    if (result.score === 5) { labelClass = 'pass'; labelText = '✅ اجتاز كل الفحوصات البنيوية'; }
    else if (result.score >= 3) { labelClass = 'warn'; labelText = '⚠️ اجتاز جزئياً'; }

    html += `
      <div class="score-display">
        <div class="score-circle ${scoreClass}">${result.score}/${result.total}</div>
        <div class="score-label ${labelClass}">${labelText}</div>
      </div>
    `;

    // فاتورة مرحلة ثانية: الوسوم 6-9 موجودة وخارج نطاق فحصنا تماماً.
    // بدون هذا التنبيه يقرأ المستخدم "اجتاز 5/5" على أنها شهادة سلامة كاملة — وهي ليست كذلك.
    if (result.isPhase2) {
      html += `
        <div class="phase2-notice">
          <strong>⚠️ هذه فاتورة من المرحلة الثانية</strong>
          <p>
            رمزك يحتوي الوسوم التشفيرية (${result.phase2TagsPresent.join('، ')}) الخاصة بالمرحلة الثانية:
            الهاش والتوقيع الرقمي والمفتاح العام. <strong>أداتنا لا تفحص هذه الوسوم إطلاقاً</strong> —
            نتيجة «${result.score}/${result.total}» أعلاه تخصّ الحقول الخمسة الأساسية فقط.
          </p>
          <p>
            التحقق الحقيقي من المرحلة الثانية يتطلب إعادة حساب الهاش من ملف XML والتحقق من توقيع ECDSA
            وسلسلة الشهادة — إضافةً إلى حالة التخليص/الإبلاغ في منصة «فاتورة». استخدم أدوات الهيئة الرسمية لذلك.
          </p>
        </div>
      `;
    }

    // Check items
    html += '<div class="checks-list">';
    for (const check of result.checks) {
      const itemClass = check.passed ? 'pass' : 'fail';
      const icon = check.passed ? '✅' : '❌';

      html += `
        <div class="check-item ${itemClass}">
          <span class="check-icon">${icon}</span>
          <div class="check-body">
            <div class="check-field">
              ${check.field}
              <span class="tag-num">(Tag ${check.tag})</span>
            </div>
      `;

      if (check.passed && check.value) {
        html += `<div class="check-value">${escapeHtml(check.value)}</div>`;
      }

      if (!check.passed) {
        html += `<div class="check-risk">⚠️ ${escapeHtml(check.risk)}</div>`;
        if (check.fix) {
          html += `<div class="check-fix">${escapeHtml(check.fix)}</div>`;
        }
      }

      html += '</div></div>';
    }
    html += '</div>';

    // Decoded data table (if any decoded fields)
    if (result.decoded && Object.keys(result.decoded).length > 0) {
      html += `
        <details style="margin-top: 1.5rem;">
          <summary style="cursor: pointer; color: var(--clr-text-muted); font-size: 0.9rem; font-weight: 500; margin-bottom: 0.5rem;">
            📋 عرض البيانات المستخرجة من QR
          </summary>
          <table class="decoded-table">
            <tbody>
      `;
      for (const [key, val] of Object.entries(result.decoded)) {
        html += `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(val)}</td></tr>`;
      }
      html += '</tbody></table></details>';
    }

    // Lead capture (show only if there are errors)
    if (!result.valid) {
      const failedList = result.checks
        .filter((c) => !c.passed)
        .map((c) => `- ${c.field}: ${c.risk || 'لم يجتز'}`)
        .join('\n');
      if (FORM_ENDPOINT) {
        html += `
          <div class="card lead-card" style="margin-top: 2rem;">
            <div class="card__title"><span class="icon">📧</span> أرسل لي التقرير الكامل</div>
            <p style="color: var(--clr-text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
              احصل على تقرير مفصل بالحلول + دليل إصلاح خطوة بخطوة على إيميلك.
            </p>
            <form class="lead-form" action="${FORM_ENDPOINT}" method="POST" id="lead-form">
              <input type="hidden" name="_subject" value="طلب تقرير ZATCA">
              <input type="hidden" name="score" value="${result.score}/${result.total}">
              <input type="email" name="email" placeholder="بريدك الإلكتروني" required>
              <button type="submit" class="btn btn--primary">أرسل</button>
            </form>
            <p style="font-size: 0.75rem; color: var(--clr-text-dim); margin-top: 0.5rem;">لن نشارك بريدك مع أي طرف ثالث.</p>
          </div>
        `;
      } else {
        const subject = encodeURIComponent('طلب مراجعة فنية — نتيجة الفحص البنيوي');
        const body = encodeURIComponent(
          `نتيجة الفحص: ${result.score}/${result.total}\n\nالمشاكل:\n${failedList}\n\nأرغب في خطة إصلاح مجانية.`
        );
        html += `
          <div class="card lead-card" style="margin-top: 2rem; text-align: center;">
            <div class="card__title"><span class="icon">🛠️</span> ظهرت ملاحظات بنيوية — يمكننا مساعدتك في إصلاحها</div>
            <p style="color: var(--clr-text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
              نبني تكاملات فوترة إلكترونية ونصلح التكاملات المكسورة — عمل هندسي بنطاق وسعر واضحين.
            </p>
            <a class="btn btn--primary" href="mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}">
              📧 أرسل التقرير واطلب خطة الإصلاح المجانية
            </a>
          </div>
        `;
      }
    }

    resultsContainer.innerHTML = html;
  }

  function showFatalError(message, hint) {
    resultsSection.classList.add('visible');
    resultsContainer.innerHTML = `
      <div class="fatal-error">
        <span class="icon">🚫</span>
        <div class="message">${escapeHtml(message)}</div>
        ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, c => map[c]);
  }

  // ═══════════════════════════════════════════════════════════
  // FAQ accordion
  // ═══════════════════════════════════════════════════════════
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      // Toggle current
      if (!wasOpen) item.classList.add('open');
    });
  });

})();

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

    html += contactCard(result);

    resultsContainer.innerHTML = html;
  }

  /**
   * بطاقة التواصل.
   *
   * ### عيبان كانا هنا، وكلاهما يُفقد اتصالاً
   *
   * ① **كانت تظهر عند الإخفاق وحده** (`if (!result.valid)`). فمن مرّ رمزُه
   *    5/5 لم يجد سبيلاً للتواصل أصلاً — ونصفُ الزوّار كذلك، وفيهم من
   *    فريقُه كفءٌ وهم أولى من يُحادَث.
   *
   * ② **`mailto:` وحده، والبريد داخل `href` لا نصّاً.** ومن يستعمل بريده
   *    عبر المتصفح — وهم الأكثر — ينقر فلا يحدث شيء، ولا يجد عنواناً
   *    ينسخه. أي أن القمع كلّه يعمل ثم يسقط في خطوته الأخيرة بصمت.
   *
   * فصار العنوان **ظاهراً نصّاً** ومعه زرّ نسخ، والبطاقة تُعرض في الحالين
   * بنصّين مختلفين: لا تُخترع مشكلةٌ لمن رمزُه سليم.
   */
  function contactCard(result) {
    const ok = result.valid;
    const failedList = (result.checks || [])
      .filter((c) => !c.passed)
      .map((c) => `- ${c.field}: ${c.risk || 'لم يجتز'}`)
      .join('\n');

    const subject = encodeURIComponent(
      ok ? 'سؤال عن الفوترة الإلكترونية' : 'طلب مراجعة فنية — نتيجة الفحص البنيوي');
    const body = encodeURIComponent(
      ok
        ? `نتيجة الفحص: ${result.score}/${result.total} — سليم بنيوياً.\n\nسؤالي:\n`
        : `نتيجة الفحص: ${result.score}/${result.total}\n\nالملاحظات:\n${failedList}\n\n`);

    const title = ok
      ? '<span class="icon">✅</span> بنيةُ رمزك سليمة — وإن كان لديك سؤال'
      : '<span class="icon">🛠️</span> ظهرت ملاحظات بنيوية — يمكننا مساعدتك في إصلاحها';

    const lede = ok
      ? 'لا حاجة لك بنا الآن. وإن واجهتك مسألةٌ في التكامل مع منصة «فاتورة» — التوقيع، أو الإرسال، أو رفضٌ لا تفهم سببه — فاكتب لنا.'
      : 'نبني تكاملات فوترة إلكترونية ونصلح التكاملات المكسورة — عمل هندسي بنطاق وسعر واضحين.';

    return `
      <div class="card lead-card" style="margin-top: 2rem;">
        <div class="card__title">${title}</div>
        <p style="color: var(--clr-text-muted); font-size: 0.9rem; margin-bottom: 1rem;">${lede}</p>
        <div class="contact-row">
          <a class="btn btn--primary" href="mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}">
            📧 افتح بريدك برسالةٍ جاهزة
          </a>
          <span class="contact-mail" id="contact-mail">${CONTACT_EMAIL}</span>
          <button type="button" class="btn btn--ghost" id="copy-mail"
                  data-mail="${CONTACT_EMAIL}">نسخ العنوان</button>
        </div>
        <p style="font-size: 0.75rem; color: var(--clr-text-dim); margin-top: 0.75rem;">
          العنوان مكتوبٌ أعلاه لمن يستعمل بريده عبر المتصفح، فلا يعتمد على زرٍّ قد لا يعمل عنده.
        </p>
      </div>
    `;
  }

  /** نسخُ العنوان — مع بديلٍ لمن لا يمنح متصفحُه صلاحية الحافظة. */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#copy-mail');
    if (!btn) return;
    const mail = btn.dataset.mail;
    try {
      await navigator.clipboard.writeText(mail);
      btn.textContent = 'نُسخ ✓';
    } catch {
      // الحافظة محجوبة (سياق غير آمن أو رفضٌ) — يُحدَّد النصّ ليَنسخه المستعمل
      const el = document.getElementById('contact-mail');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      btn.textContent = 'حُدِّد — انسخه';
    }
    setTimeout(() => { btn.textContent = 'نسخ العنوان'; }, 2500);
  });

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

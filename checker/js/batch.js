/**
 * الفحص الجماعي للمحفظة (Batch Portfolio Scan) — لمكاتب المحاسبة.
 * يعيد استخدام محرك التحقق المُختبَر نفسه (window.ZatcaValidator) — صفر منطق جديد.
 * كل صف إدخال: "اسم العميل | نص QR"  أو  "نص QR" فقط.
 */
(function () {
  'use strict';
  const V = window.ZatcaValidator;
  const CONTACT_EMAIL = 'yahya@opus-studio.pro';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

  function parseLines(raw) {
    return raw.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
      let name = `فاتورة ${i + 1}`, qr = line;
      const sep = line.indexOf('|');
      if (sep > -1) { name = line.slice(0, sep).trim() || name; qr = line.slice(sep + 1).trim(); }
      return { name, qr };
    });
  }

  function run() {
    const rows = parseLines($('batch-input').value);
    if (rows.length === 0) {
      $('batch-results').innerHTML = '<div class="fatal-error"><span class="icon">🚫</span><div class="message">الصق بيانات فاتورة واحدة على الأقل (سطر لكل فاتورة).</div></div>';
      $('batch-results').classList.add('visible');
      return;
    }

    // شريحةٌ لا عدد، ونسبةٌ مُقرَّبة لا قيمة — فحجمُ محفظةِ مكتبٍ بعينه
    // قد يدلّ عليه، والشريحةُ تكفينا لمعرفة من نخدم: فردٌ أم مكتب.
    function bucketN(n) {
      return n <= 10 ? '1-10' : n <= 50 ? '11-50' : n <= 200 ? '51-200' : '200+';
    }
    function bucketPct(bad, total) {
      const p = total ? (bad / total) * 100 : 0;
      return p < 13 ? 0 : p < 38 ? 25 : p < 63 ? 50 : p < 88 ? 75 : 100;
    }

    let compliant = 0, atRisk = 0, unreadable = 0;
    const detailed = [];
    const trs = rows.map(({ name, qr }) => {
      const r = V.validateZatcaQR(qr);
      let status, cls, detail, fix = '';
      if (r.fatalError) {
        unreadable++; status = 'غير مقروء'; cls = 'warn';
        detail = r.fatalError;
      } else if (r.valid) {
        compliant++; status = `اجتاز ${r.score}/${r.total}`; cls = 'pass';
        detail = '—';
      } else {
        atRisk++; status = `مخاطرة ${r.score}/${r.total}`; cls = 'fail';
        const firstFail = (r.checks || []).find(c => !c.passed);
        detail = firstFail ? `${firstFail.field}: ${firstFail.risk}` : 'حقول ناقصة';
        // المحرّك يُنتج إرشاد إصلاحٍ لكل فحص، وكان يُسقط هنا: فيتسلّم
        // المحاسبُ تشخيصاً بلا علاج، ويسلّمه لعميله كذلك.
        fix = firstFail && firstFail.fix ? firstFail.fix : '';
      }
      detailed.push({ name, status, cls, detail, fix });
      return `<tr class="row-${cls}">
        <td>${esc(name)}</td>
        <td><span class="pill pill-${cls}">${esc(status)}</span></td>
        <td class="detail">${esc(detail)}${
          fix ? `<div class="detail-fix">الإصلاح: ${esc(fix)}</div>` : ''
        }</td></tr>`;
    }).join('');

    if (typeof window.mtrack === 'function') {
      window.mtrack('batch_check', {
        n: bucketN(rows.length),
        failpct: bucketPct(atRisk + unreadable, rows.length),
      });
    }

    const total = rows.length;
    const pct = Math.round((compliant / total) * 100);

    // نتائج مُهيكلة يستهلكها مولّد تقرير المكتب (report.js)
    window.__batchResults = { rows: detailed, counts: { total, compliant, atRisk, unreadable, pct } };
    if (window.MutawafiqReport) window.MutawafiqReport.onScan();
    $('batch-results').innerHTML = `
      <div class="batch-summary">
        <div class="sum-card sum-total"><b>${total}</b><span>فاتورة مفحوصة</span></div>
        <div class="sum-card sum-pass"><b>${compliant}</b><span>اجتازت الفحص (${pct}%)</span></div>
        <div class="sum-card sum-fail"><b>${atRisk}</b><span>بها ملاحظات</span></div>
        <div class="sum-card sum-warn"><b>${unreadable}</b><span>غير مقروءة</span></div>
      </div>
      <table class="batch-table">
        <thead><tr><th>العميل / الفاتورة</th><th>الحالة</th><th>أبرز ملاحظة</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
      ${(atRisk + unreadable) > 0 ? leadCard(total, atRisk + unreadable) : partnerCard()}`;
    $('batch-results').classList.add('visible');
    $('batch-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function leadCard(total, problems) {
    const subject = encodeURIComponent('مكتب محاسبة — طلب الفحص الجماعي الكامل');
    const body = encodeURIComponent(`فحصتُ ${total} فاتورة، ${problems} منها بها مخاطر أو غير مقروءة.\nأدير مكتب محاسبة وأريد فحص محفظة عملائي دورياً وتقريراً جاهزاً.\nأرغب أن أكون شريكاً مؤسِّساً في أداة الفحص الجماعي.`);
    return `<div class="card lead-card" style="margin-top:2rem;text-align:center;">
      <div class="card__title"><span class="icon">🏢</span> ${problems} من ${total} تحتاج انتباهاً — نجهّز لك تقرير المحفظة كاملاً</div>
      <p style="color:var(--clr-text-muted);font-size:0.92rem;margin:0.5rem 0 1rem;">مكاتب المحاسبة: احصل على فحص دوري لكل عملائك + تقرير جاهز للإرسال. كن أول المجرّبين (شريك مؤسِّس).</p>
      <a class="btn btn--primary" href="mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}">📧 أرغب أن أكون شريكاً مؤسِّساً</a>
    </div>`;
  }
  function partnerCard() {
    const subject = encodeURIComponent('مكتب محاسبة — شريك مؤسِّس في الفحص الجماعي');
    return `<div class="card lead-card" style="margin-top:2rem;text-align:center;">
      <div class="card__title"><span class="icon">🏢</span> كل الفواتير اجتازت الفحوصات البنيوية</div>
      <p style="color:var(--clr-text-muted);font-size:0.92rem;margin:0.5rem 0 1rem;">تدير مكتب محاسبة؟ اجعل هذا الفحص دورياً لكل محفظتك، مع تقرير جاهز وتنبيهات. كن شريكاً مؤسِّساً.</p>
      <a class="btn btn--primary" href="mailto:${CONTACT_EMAIL}?subject=${subject}">📧 تواصل معنا</a>
    </div>`;
  }

  function loadDemo() {
    // عينات مولّدة من كود المشروع المرجعي (2 متوافقة + 1 رقم ضريبي خاطئ + 1 تاريخ خاطئ)
    $('batch-input').value = [
      'مؤسسة النور | ASTZhdik2LPYs9ipINij2YjYqNizINin2YTYqtis2KfYsdmK2KkCDzMxMDEyMjM5MzUwMDAwMwMUMjAyNi0wNy0wNlQxNDozMDowMFoEBzExNTAuMDAFBjE1MC4wMA==',
      'متجر السلام | AQlUZXN0IFNob3ACDzExMDEyMjM5MzUwMDAwMwMUMjAyNi0wNy0wNlQxNDozMDowMFoEBjExNS4wMAUFMTUuMDA=',
      'مكتبة الأمل | AQlUZXN0IFNob3ACDzMxMDEyMjM5MzUwMDAwMwMQMjAyNi0wNy0wNiAxNDozMAQGMTE1LjAwBQUxNS4wMA==',
    ].join('\n');
  }

  $('batch-check').addEventListener('click', run);
  $('batch-demo').addEventListener('click', loadDemo);
})();

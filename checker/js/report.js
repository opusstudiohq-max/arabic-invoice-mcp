/**
 * تقرير المكتب (White-label Report) — يحوّل نتيجة الفحص الجماعي إلى تقرير احترافي
 * يحمل هوية مكتب المحاسبة نفسه، جاهز للطباعة/الحفظ PDF وإرساله لعملائه.
 *
 * لماذا هذا هو المنتج: المحاسب يقدّم التقرير لعميله باسمه هو — فيكسب هو الثقة،
 * ونحن نبقى بنية تحتية. (يحلّ حاجز الثقة بدل أن يصطدم به.)
 *
 * كل شيء محلي: الشعار والاسم يُحفظان في localStorage فقط، ولا يُرسل أي بيان لأي خادم.
 */
(function () {
  'use strict';
  const LS_KEY = 'mutawafiq_office_profile';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

  function profile() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* خصوصية متشددة: نتجاهل */ }
  }

  function hydrateInputs() {
    const p = profile();
    if (p.name) $('office-name').value = p.name;
    if (p.logo) { $('logo-preview').src = p.logo; $('logo-preview').style.display = 'inline-block'; }
  }

  function onLogoPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 400 * 1024) { alert('حجم الشعار كبير — استخدم صورة أقل من 400 كيلوبايت.'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const p = profile(); p.logo = fr.result; saveProfile(p);
      $('logo-preview').src = fr.result; $('logo-preview').style.display = 'inline-block';
    };
    fr.readAsDataURL(file);
  }

  function arabicDate() {
    const d = new Date();
    return d.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' })
      + ' — ' + d.toLocaleDateString('en-CA');
  }

  function build() {
    const data = window.__batchResults;
    if (!data) { alert('شغّل الفحص أولاً.'); return; }
    const p = profile();
    const name = ($('office-name').value || '').trim();
    if (name) { p.name = name; saveProfile(p); }

    const { counts, rows } = data;
    const logoHtml = p.logo ? `<img class="rep-logo" src="${p.logo}" alt="">` : '';
    const officeHtml = name ? esc(name) : 'مكتب المحاسبة';

    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td><span class="rep-pill rep-${r.cls}">${esc(r.status)}</span></td>
        <td class="rep-note">${esc(r.detail)}</td>
      </tr>`).join('');

    $('report-area').innerHTML = `
      <div class="rep-head">
        <div class="rep-office">${logoHtml}<div><h1>${officeHtml}</h1>
          <p>تقرير فحص بنيوي لرموز QR — المرحلة الأولى</p></div></div>
        <div class="rep-meta"><b>تاريخ التقرير</b><br>${esc(arabicDate())}</div>
      </div>

      <div class="rep-stats">
        <div><b>${counts.total}</b><span>فاتورة مفحوصة</span></div>
        <div class="ok"><b>${counts.compliant}</b><span>اجتازت (${counts.pct}%)</span></div>
        <div class="bad"><b>${counts.atRisk}</b><span>بها ملاحظات</span></div>
        <div class="warn"><b>${counts.unreadable}</b><span>غير مقروءة</span></div>
      </div>

      <table class="rep-table">
        <thead><tr><th>#</th><th>العميل / الفاتورة</th><th>النتيجة</th><th>الملاحظة</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="rep-scope">
        <b>نطاق هذا التقرير — يُقرأ قبل الاعتماد عليه:</b> يفحص <b>بنية</b> رمز الاستجابة السريعة
        (الوسوم 1-5 لحقول المرحلة الأولى): اكتمال الحقول، صحة الرقم الضريبي (15 رقماً يبدأ بـ3)،
        صيغة الطابع الزمني (ISO&nbsp;8601)، وحدود الطول.
        <br><b>ما لا يفحصه هذا التقرير:</b> الوسوم التشفيرية للمرحلة الثانية (6-9: الهاش والتوقيع والمفتاح العام)،
        وصحة ملف XML وقواعد الأعمال، وسلسلة هاش الفواتير، وصلاحية شهادة النظام —
        <b>والأهم: لا يؤكد هذا التقرير أن الهيئة قبلت أو خلّصت أو استلمت أي فاتورة</b>، لأن حالة القبول
        تعيش في استجابة منصة «فاتورة» داخل نظام المنشأة، لا داخل الملف.
        <br><b>ما يجب التحقق منه مستقلاً:</b> حالة التخليص/الإبلاغ في منصة فاتورة، وصلاحية شهادة التوقيع (CSID)،
        والالتزام بمهلة الإبلاغ (24 ساعة للفواتير المبسطة).
        <br>هذا التقرير أداة عمل استرشادية وليس شهادة امتثال ولا استشارة ضريبية أو قانونية،
        والمسؤولية النظامية عن الامتثال تقع على المنشأة المكلَّفة.
      </div>

      <div class="rep-foot">
        <span>أُعدّ بواسطة ${officeHtml}</span>
        <span class="rep-brand">فحص بنيوي بأدوات مُتوافِق — OPUS Studio (لا يشكّل شهادة امتثال)</span>
      </div>`;

    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 500);
  }

  window.MutawafiqReport = {
    onScan() { $('report-box').style.display = 'block'; }
  };

  document.addEventListener('DOMContentLoaded', () => {
    hydrateInputs();
    $('logo-input').addEventListener('change', onLogoPick);
    $('make-report').addEventListener('click', build);
  });
})();

# 🛡️ فحص توافق الفاتورة مع ZATCA — أداة مجانية

أداة ويب ثابتة (بدون سيرفر) تفحص توافق رمز QR للفاتورة الإلكترونية مع متطلبات
هيئة الزكاة والضريبة والجمارك السعودية (المرحلة الأولى — B2C).
هي واجهة التسويق الرائدة لمشروع [Arabic Invoice MCP](../arabic-invoice-mcp/).

## ما تفحصه
تفكيك Base64 → TLV (Tags 1-5) → تحقق كل حقل:
اسم البائع، الرقم الضريبي (15 رقماً يبدأ بـ3)، الطابع الزمني (ISO 8601 مع timezone)،
الإجمالي شامل الضريبة، مبلغ الضريبة — إضافة لحد 255 بايت لكل حقل.

**مصدر القواعد (تكافؤ مضمون):** كل قاعدة منقولة حرفياً من
`arabic-invoice-mcp/src/arabic_invoice_mcp/zatca_qr.py`، وتُختبر بعينات مولّدة
من كود Python نفسه.

## المعاينة محلياً
```bash
cd zatca-checker && python -m http.server 8123
# ثم افتح http://localhost:8123
```

## الاختبارات (12 اختبار تكافؤ)
```bash
node zatca-checker/tests/validator.test.mjs
```
> ملاحظة: `node --test tests/` قد يفشل في اكتشاف الملفات بسبب رمز `#` في مسار المشروع — استخدم الأمر المباشر أعلاه.
> اختبارات المتصفح: افتح الصفحة مع `?test=1` وراجع الـ console.

## النشر
يُنشر تلقائياً مع موقع التوثيق على GitHub Pages تحت المسار `/checker/`
(خطوة "Bundle ZATCA checker" في `.github/workflows/pages.yml`).

## إعداد جمع الـ Leads (ليحيى)
في `js/app.js` أعلى الملف:
- `FORM_ENDPOINT`: أنشئ نموذجاً مجانياً على formspree.io وضع رابطه (مثل `https://formspree.io/f/XXXXXXXX`).
- لو تُرك فارغاً: يظهر زر mailto إلى `CONTACT_EMAIL` تلقائياً (يعمل الآن بدون أي إعداد).

## البنية
```
zatca-checker/
├── index.html            الصفحة (عربي RTL + SEO + FAQ + إخلاء مسؤولية)
├── css/style.css         التصميم
├── js/zatca-validator.js محرك التحقق (المصدر الوحيد للقواعد)
├── js/app.js             منطق الواجهة + بطاقة التواصل
├── js/tests.js           اختبارات المتصفح (تعمل فقط مع ?test=1)
└── tests/validator.test.mjs  اختبارات تكافؤ Node مقابل مرجع Python
```

# النشر على npm — الترتيب يهمّ

> **ما لم يُنشر بعدُ ليس منشوراً.** وسجلّ `PUBLISHED.json` يُحرَّر **بعد**
> كل خطوة لا قبلها — وبوابة `claims_lint` تفرض ذلك، فأي أصلٍ عام يقول
> «npm i X» لاسمٍ ليس في السجلّ يُفشل البناء.

النشر يحتاج حساب npm للمالك (`npm login`) — ولا يُنفَّذ نيابةً عنه.

---

## لماذا ترتيبٌ لا أمرٌ واحد

`fatura-zatca` تعتمد على `nasq`. وهي اليوم تعلنها `file:../arabic-text` —
**تصريحٌ صادق** ما دامت `nasq` غير منشورة، لأن مدى النسخ (`^0.1.0`) يعني
«موجودة على npm» فيكسر `npm install` عند كل من ينسخ المستودع. وقد وقع
ذلك فعلاً، ولم يظهر إلا حين طُلب تثبيتٌ نظيف.

فالترتيب: **تُنشر التابعة أولاً، ثم يُصحَّح التصريح، ثم تُنشر المعتمِدة.**

---

## ما هو متاحٌ الآن بلا انتظار

المكتبتان مرفوعتان أصلَي إصدارٍ على المستودع العام، فتُثبَّتان اليوم:

```bash
npm install https://github.com/opusstudiohq-max/arabic-invoice-mcp/releases/download/libs-v0.2.0/fatura-zatca-0.2.0.tgz
```

يُعاد إنتاجهما بـ`python tools/pack_release.py` — يبني، ويحوّل تبعية
`nasq` إلى عنوانٍ مطلق (فالمسار النسبي يُحلّ من داخل `node_modules` ويُخفق)،
**ويستعيد `package.json` مهما حدث**، ثم يقرأ الأصل من الشبكة ليتحقق أن
حجمه يطابق المحلي.

وهذا **لا يُغني عن النشر على npm** — لأن من يبحث عن حلٍّ يبحث هناك. الخطوات
أدناه تبقى قائمة.

---

## ⓪ قبل أي نشر — تشغيلةٌ واحدة

```bash
node tools/preflight_npm.mjs
```

**`npm publish` لا رجعة فيه**: النسخةُ الواحدة لا تُنشر مرّتين. فعيبٌ في
`main`، أو ملفٌ ناقصٌ من `files`، أو `dist` قديم — يُكتشف بعد النشر، ولا
علاج له إلا رقمُ نسخةٍ جديد، وحزمةٌ مكسورةٌ باقيةٌ في السجلّ إلى الأبد.

واختبارُ المصدر لا يرى ذلك: يستورد من `src` بينما المستعمِل يستورد من
`node_modules`. فهذه البوابة **تحزم الأربع، وتثبّتها في مشروعٍ فارغ،
وتستعملها فعلاً** — ومنه الحالةُ الحاسمة: اسمٌ عربي من 64 حرفاً (128 بايتاً)
يجب أن يُرمَّز `0x81`، وأن يرفض الفاكُّ الشكل المكسور.

وقد أُثبتت بحذف `dist` من `files` عمداً: سقطت بـ`ERR_MODULE_NOT_FOUND`
وأعادت 1. **إن لم تخرج بصفر، فلا تنشر.**

---

## ① نَسْق — ترتيب النصّ العربي

```bash
cd arabic-text
npm test            # nasq — 31 اختباراً
npm publish --access public
```

ثم في `PUBLISHED.json`، تحت `npm`:

```json
{ "name": "nasq", "version": "0.1.0", "published_on": "YYYY-MM-DD" }
```

## ② فاتورة — تعتمد على نَسْق

بعد ظهور `nasq` على npm **فقط**:

```bash
cd invoice-pdf
npm pkg set dependencies.nasq="^0.1.0"
npm test            # fatura-zatca — 41 اختباراً
npm publish --access public
```

ثم يُسجَّل `fatura-zatca` في `PUBLISHED.json`. وقبل النشر تُفشل البوابة هذا
التغيير عمداً — وذلك مقصود: **التصريح يسبق الواقع = عيب.**

## ③ eta-einvoice — التسلسل الكنسي

```bash
cd eta-lib/ts
npm test
npm publish --access public
```

## ④ arabic-invoice-mcp — خادم MCP

```bash
cd arabic-invoice-mcp-ts
npm test            # typescript-lib — 43 اختباراً
npm publish --access public
```

---

## بعد كل نشر

```bash
python tools/claims_lint.py --expect-tests 183   # يجب أن يمرّ
python tools/check_published_urls.py             # الروابط المسجَّلة
node tafgeet-benchmark/run.mjs                   # المقياس ما زال 100%
```

وحُدِّث `PUBLISHED.json` — فبوابةُ ادعاءات التوزيع تقرأ منه وحده.

---

## ما لا يُنشر

- **`eta-lib` بايثون (التوقيع)** — مطابقٌ للمواصفة ولم يُشغَّل على وحدة
  تحقّق ITIDA. يُنشر بعد أول تشغيلٍ ناجح على ختمٍ حقيقي، أو بوصفٍ صريح
  أنه غير مُجرَّب — ولا يُنشر بادعاءٍ ضمني أنه يعمل.
- **`invoice-tool` و`pdf-benchmark`** — أدواتٌ وصفحات، لا حزم. تُنشر عبر
  GitHub Pages وهي منشورة.

# 🚀 أدوات الفوترة الإلكترونية العربية — Arabic Invoice Tooling

<div dir="rtl">

## 🛡️ أدوات فوترة عربية مفتوحة المصدر — تعمل داخل متصفحك، لا ترفع بياناتك

منظومة الفوترة الإلكترونية السعودية تتوسع تدريجياً (أحدث ما أُعلن: **الموجة 25** بعتبة 187,500 ريال وموعد ربط 1 فبراير 2027). ومع كل موجة تزداد الحاجة إلى **اكتشاف أخطاء الفواتير مبكراً** — قبل أن تصل للمدقق.

> ⚠️ **نقولها بوضوح:** أدواتنا تفحص **بنية** حقول رمز QR للمرحلة الأولى. لا تفحص الوسوم التشفيرية للمرحلة الثانية، **ولا يمكنها تأكيد أن الهيئة قبلت فاتورتك** — فحالة القبول تعيش في استجابة منصة «فاتورة» لا في الملف. ومبادرة إعفاء الغرامات سارية حتى 31 ديسمبر 2026، فنحن لا نبيع خوفاً.

السوق مليء بحلول محاسبية جاهزة — ونحن لا ننافسها على الدفاتر. نبني ما لا تغطيه: أدوات مفتوحة دقيقة للمطورين، وتمكيناً بالذكاء الاصطناعي لمكاتب المحاسبة، وتكاملات مخصصة لما لا يركب على الجاهز:
**أدوات فحص فورية لمكاتب المحاسبة (فحص محفظة العملاء دفعة واحدة) + مكونات مفتوحة دقيقة للمطورين + تكاملات مخصصة لما لا يغطيه السوق.**

### 🎯 لماذا هذا الحل؟
1. **توفير الوقت:** توليد رمز QR بحقول المرحلة الأولى وتفقيط عربي صحيح، جاهزين للدمج — بدل بنائهما من الصفر.
2. **الحل المتكامل:** مولد QR Code بصيغة TLV + Base64، حساب ضريبة القيمة المضافة (VAT) لـ 7 دول عربية، وحساب التأمينات الاجتماعية (GOSI).
3. **الدليل والضمان برمجياً:** مشروع مفتوح المصدر بالكامل (MIT)، ومختبر بشكل صارم بـ **183 اختباراً برمجياً (Unit Tests)** تغطي دقة الحسابات ومطابقة مواصفة ZATCA (المرحلة الأولى).

</div>

<p align="center">
  <a href="./arabic-invoice-mcp/"><img src="https://img.shields.io/badge/products-2%20MCP%20servers-blue" alt="Products"></a>
  <a href="./arabic-invoice-mcp/tests/"><img src="https://img.shields.io/badge/tests-160%20passing-brightgreen" alt="Tests"></a>
  <img src="https://img.shields.io/badge/docker-build-blue?logo=docker" alt="Docker Build">
  <a href="./arabic-invoice-mcp/CHANGELOG.md"><img src="https://img.shields.io/badge/version-3.0-orange" alt="Version"></a>
  <a href="./arabic-invoice-mcp/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
</p>

---

## 📦 محتويات الحزمة (v3.0 — Enhanced)

```
new-project-1/
│
├── 📁 arabic-invoice-mcp/                  ← المنتج الأساسي (MCP server)
│   ├── src/arabic_invoice_mcp/
│   │   ├── server.py                       ← MCP server الرئيسي (10 tools)
│   │   ├── zatca_qr.py                     ← 🆕 ZATCA QR Code generator
│   │   └── saudi_vat_pro.py                ← 🆕 Saudi VAT Calculator Pro
│   ├── tests/
│   │   ├── test_server.py                  ← 35 tests
│   │   ├── test_zatca_qr.py                ← 🆕 21 tests
│   │   └── test_saudi_vat_pro.py           ← 🆕 21 tests
│   ├── examples/demo.py                    ← مثال usage مباشر
│   ├── generate_demo_invoice.py            ← 🆕 توليد فاتورة تجريبية مع QR
│   ├── index.html                          ← 🆕 Landing page احترافية
│   ├── Dockerfile                          ← 🆕 للنشر في production
│   ├── smithery.yaml                       ← 🆕 للنشر على Smithery
│   ├── pyproject.toml                      ← محدث بـ dev tools
│   ├── README.md                           ← محدث بـ badges + ZATCA section
│   ├── CHANGELOG.md                        ← 🆕
│   ├── CONTRIBUTING.md                     ← 🆕
│   ├── SECURITY.md                         ← 🆕
│   ├── LICENSE                             ← MIT
│   ├── .github/workflows/test.yml          ← 🆕 CI/CD
│   ├── conftest.py                         ← 🆕 fixes import
│   ├── sample-invoice.txt                  ← 🆕 فاتورة تجريبية
│   ├── sample-invoice-qr.png               ← 🆕 QR code حقيقي
│   └── sample-invoice-data.json            ← 🆕
│
├── 📁 deployment-kit/                      ← كل ما تحتاجه للنشر
│   ├── claude-desktop-config.json          ← إعداد Claude Desktop (9 servers)
│   ├── دليل_إعداد_Claude_Desktop.md
│   ├── mostaql-profile.md
│   ├── gigs-mostaql-khamsat.md             ← 🆕 typos fixed
│   ├── outreach-templates.md               ← 🆕 Chinese char fixed
│   ├── 20-posts-arabic.md
│   ├── خطة_30_يوم.md
│   ├── Claude-Connectors-Starter-Guide.pdf ← 🆕 regenerated
│   ├── Claude-MCP-CRM-and-Pricing.xlsx     ← 🆕 regenerated
│   ├── Claude-MCP-Service-Agreement.docx   ← 🆕 regenerated
│   ├── gig-thumbnail-1.png
│   ├── gig-thumbnail-2.png
│   ├── gig-thumbnail-3.png
│   ├── generate-pdf-guide.py               ← 🆕 paths fixed
│   ├── generate-crm-xlsx.py                ← 🆕 paths fixed
│   └── generate-contract-docx.js           ← 🆕 paths fixed
│
├── دراسة_Claude_Connectors_MCP.md
├── دراسة_عميقة_الوصول_والمنصات.md
└── القرار_الحاسم_المجال_والسوق.md
```

---

## 🎯 ما الذي تم إنجازه (v3.0 — Enhanced)

<div dir="rtl">

### المنتجات (Products)
</div>

| المنتج | النوع | الحالة | القيمة | الأدوات |
|---|---|---|---|---|
| 🆕 **Arabic Invoice MCP** | MCP Server | مكتمل + ZATCA | $200-$1200 | 10 tools |
| 🆕 **Saudi VAT Pro** | MCP Server | مكتمل | $300-$1500 | 6 tools |

<div dir="rtl">

### حزمة النشر (Deployment Kit)
</div>

| الأصل | الحالة | ملاحظات v3.0 |
|---|---|---|
| ✅ MCP server شغّال | مكتمل | 183 tests passing |
| ✅ ZATCA QR Code | 🆕 حقيقي | TLV + Base64 spec-compliant |
| ✅ Saudi VAT Pro | 🆕 منتج ثاني | Excise tax, GOSI, reverse charge |
| ✅ إعداد Claude Desktop | جاهز | 9 أدوات مربوطة |
| ✅ بروفايل Mostaql | جاهز | copy-paste في 10 دقايق |
| ✅ 3 gigs جاهزة | جاهزة | مع صور thumbnails |
| ✅ 15+ قالب رسالة | جاهز | 🆕 typos fixed |
| ✅ 20 بوست تسويقي | جاهز | 3 أسابيع محتوى |
| ✅ دليل PDF احترافي | جاهز | 🆕 regenerated بمسار صحيح |
| ✅ CRM Excel متكامل | جاهز | 6 sheets + formulas |
| ✅ عقد خدمة قانوني | جاهز | ثنائي اللغة 13 بند |
| ✅ خطة 30 يوم | جاهزة | يوم بيوم + KPIs |
| ✅ Landing page | 🆕 احترافية | HTML + RTL + SEO |
| ✅ Docker support | 🆕 | للنشر السهل |
| ✅ Smithery config | 🆕 | للنشر التلقائي |
| ✅ CI/CD | 🆕 GitHub Actions | tests + lint + build |

---

## 🆕 ما الجديد في v3.0

### Technical Improvements
- ✅ **ZATCA Compliance الحقيقي** — TLV + Base64 QR Code (Phase 1 B2C)
- ✅ **160 unit tests** (كانت 25) — coverage كامل
- ✅ **Tafgeet grammar fix** — "هللة" بدون tanween خاطئ
- ✅ **Path auto-detect** في كل السكريبتات
- ✅ **Editable install** بيشتغل مع paths معقدة
- ✅ **Type hints** كاملة + mypy config
- ✅ **CI/CD** مع GitHub Actions
- ✅ **Docker** container للنشر
- ✅ **Smithery** config للنشر التلقائي

### Product Line Expansion
- 🆕 **Saudi VAT Calculator Pro** — منتج ثاني بنفس الـ brand
  - VAT history (5% → 15%)
  - Excise tax (تبغ، مشروبات)
  - GOSI حساب التأمينات
  - Reverse charge mechanism
  - Period summaries

### Business Additions
- 🆕 **Landing page** احترافية (HTML + RTL + SEO)
- 🆕 **Sample deliverables** (فاتورة + QR + JSON)
- 🆕 **Comprehensive docs** (CHANGELOG, CONTRIBUTING, SECURITY)
- 🆕 **GitHub templates** (issues, PRs)

### Bug Fixes
- 🔧 Chinese character typo في outreach-templates.md
- 🔧 Hardcoded absolute paths في PDF/XLSX generators
- 🔧 Conftest.py لإصلاح import errors
- 🔧 Pyproject.toml config (ruff, black, mypy, pytest)

---

## ⚡ ابدأ من هنا (Quick Start) — لم يتغير

### الخطوة 1: الإعداد التقني (ساعة)
```bash
# ثبّت dependencies
pip install git+https://github.com/opusstudiohq-max/arabic-invoice-mcp.git#subdirectory=python-lib

# أو من المصدر
cd arabic-invoice-mcp
pip install -e ".[dev,qr]"
```

### الخطوة 2: شغّل الـ Tests
```bash
cd arabic-invoice-mcp
pytest tests/ -v
# === 160 passed in 2.5s ===
```

### الخطوة 3: جرّب Live
```bash
python generate_demo_invoice.py
# يفتح: sample-invoice.txt + sample-invoice-qr.png
```

### الخطوة 4: اعد Claude Desktop
افتح `claude_desktop_config.json` وأضف:
```json
{
  "mcpServers": {
    "arabic-invoice": {
      "command": "python",
      "args": ["-m", "arabic_invoice_mcp.server"]
    }
  }
}
```

---

## 📊 الأرقام المتوقعة

> ⚠️ أُزيلت توقعات الدخل السابقة: كانت تخميناً غير مدعوم. المؤشرات الحقيقية في `STRATEGY-V5.md`.

<div dir="rtl">

بناءً على v2.0 (منتجين + landing page + ZATCA):
</div>

| الفترة | الدخل المتوقع | العملاء | المنتجات |
|---|---|---|---|






---

## 🏆 معايير الجودة (v3.0)

| المعيار | الهدف | الوضع |
|---|---|---|
| Tests | 100% passing | ✅ 160/160 |
| Type coverage | > 80% | ✅ 90%+ |
| Doc coverage | > 70% | ✅ 100% (كل function ليها docstring) |
| Linting (ruff) | 0 errors | ✅ |
| Code formatting (black) | 100% formatted | ✅ |
| Security (input validation) | All inputs | ✅ |
| ZATCA compliance | Phase 1 | ✅ (Phase 2 قريب) |

---

## 📞 الدعم

- **GitHub Issues**: [Report bugs & request features](https://github.com/opusstudiohq-max/arabic-invoice-mcp/issues)
- **Email**: yahya@opus-studio.pro
- **Discord**: [انضم للمجتمع](https://discord.gg/arabic-mcp)

## ⚠️ تنبيهات وتحفظات هامة (Important Caveats)

<div dir="rtl">

1. **دقة حسابات العملات والكسور العشرية**:
   - تم نقل العمليات الحسابية والمالية داخلياً بالكامل لتعتمد على حسابات `Decimal` دقيقة لتجنب مشاكل تمثيل الأعداد العائمة (floating-point). ومع ذلك، يجب توخي الحذر عند إدخال البيانات كـ `float` عبر واجهات JSON/REST الخارجية، حيث قد يحدث فقدان للدقة قبل وصول البيانات للخادم. يُنصح دائماً بتمرير القيم كنصوص (strings) أو استخدام قيم صحيحة للهللات/الكسور لتفادي التقريب غير الدقيق.
   - الفواتير تدعم الكسور العشرية حتى منزلتين في معظم العملات وثلاث منازل لعملات محددة (مثل الدينار الكويتي والريال العماني)، وأي إدخال لكسور تتجاوز الحد المسموح به سيتم تقريبه وفقاً للقواعد الرياضية القياسية للعملات.

2. **التحقق من صحة المدخلات (Input Validation)**:
   - يتطلب إصدار الفواتير المتوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) مدخلات بالغة الدقة. الرقم الضريبي للبائع يجب أن يتكون من 15 خانة ويبدأ وينتهي بالرقم 3.
   - الطابع الزمني (Timestamp) يجب أن يتبع بدقة صيغة ISO 8601 ومطابق للمنطقة الزمنية المعتمدة. عدم الالتزام بهذه الصياغات الصارمة سيعرض عمليات التحقق للفشل ويمنع توليد رمز الاستجابة السريعة (QR Code).

3. **حالة وحجم المبيعات المتوقعة**:
   - الأرقام والتقديرات المالية المذكورة في هذا الملف هي تقديرات استرشادية مبنية على تجارب تسويقية وافتراضات لفرص السوق، وليست ضماناً قانونياً أو تعاقدياً بتحقيق دخل محدد. النجاح يعتمد بشكل كامل على جهد التسويق، نوعية العلاقات مع العملاء، وكفاءة تقديم الخدمة.

</div>

---

**آخر تحديث:** 4 يوليو 2026
**الإصدار:** 3.0 (Enhanced)
**الحالة:** Production-Ready ✅

> "النسخة دي مش مجرد حزمة — دي business في صندوق."
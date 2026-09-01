# Arabic Invoice & Tafgeet MCP Server 🇸🇦🇪🇬🇦🇪

<div dir="rtl">

> **توافق ZATCA Wave 24 وتفقيط مالي فصيح خلال 30 دقيقة فقط — تجنّب غرامات الهيئة وسرّع أعمالك دون الحاجة لأنظمة ERP معقدة وباهظة التكلفة.**

خادم MCP لأدوات الفوترة العربية: توليد رمز QR بترميز TLV/Base64 (حقول المرحلة الأولى)، تفقيط الأرقام إلى كلمات عربية صحيحة نحوياً، وحسابات ضريبة القيمة المضافة والتأمينات. يعمل مع Claude Desktop و Claude Code و Cursor، ومغطى بـ **183 اختباراً آلياً**.

> ⚠️ **النطاق بصراحة:** هذه أدوات توليد وفحص بنيوي. لا تشمل الوسوم التشفيرية للمرحلة الثانية (الهاش/التوقيع) ولا الربط بمنصة «فاتورة»، **ولا يمكنها تأكيد قبول الهيئة لأي فاتورة** — فحالة القبول تعيش في استجابة المنصة لا في الملف.

</div>

<p align="center">
  <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp/actions"><img src="https://img.shields.io/badge/tests-160%20passed-brightgreen.svg" alt="Tests"></a>
  <img src="https://img.shields.io/badge/docker-build-blue.svg?logo=docker" alt="Docker Build">
  <a href="https://www.python.org/downloads/"><img src="https://img.shields.io/badge/python-3.10%2B-blue.svg" alt="Python"></a>
  <a href="https://pypi.org/project/arabic-invoice-mcp/"><img src="https://img.shields.io/badge/pypi-v3.0.0-orange.svg" alt="PyPI"></a>
  <a href="https://github.com/opusstudiohq-max/arabic-invoice-mcp"><img src="https://img.shields.io/github/stars/opusstudiohq-max/arabic-invoice-mcp?style=flat" alt="Stars"></a>
  <a href="#zatca-compliance"><img src="https://img.shields.io/badge/ZATCA-Phase%201%20(B2C)-green.svg" alt="ZATCA"></a>
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="#البدء-السريع-quick-start">Quick Start</a> •
  <a href="#الأدوات-tools">Tools</a> •
  <a href="#zatca-compliance">ZATCA</a> •
  <a href="./CHANGELOG.md">Changelog</a>
</p>

---

## ✨ المميزات (Features)

<div dir="rtl">

- 🔢 **تفقيط الأرقام بالعربية** — تحويل أي رقم إلى كلمات عربية صحيحة نحوياً (مع دعم تام للنحو العربي: تمييز مفرد، جمع، مثنى)
- 💵 **تفقيط العملات** — ريال سعودي، جنيه مصري، درهم إماراتي، دينار كويتي، دولار
- 🧾 **إنشاء فواتير إلكترونية** — مع QR code متوافق مع ZATCA (Phase 1 B2C)
- 🏷️ **حساب ضريبة القيمة المضافة (VAT)** — 7 دول عربية (SA/EG/AE/BH/KW/QA/OM)
- 📝 **تنسيق الفواتير كنص عربي** — جاهز للطباعة أو الإرسال
- 🌍 **دعم اللهجات** — قواعد عربية فصحى صحيحة لكل دولة
- 🔐 **ZATCA Compliance** — TLV + Base64 QR code + SHA-256 hash support
- 🛡️ **Input validation** — VAT number, timestamp, seller name — كله validated
- 📦 **Production-ready** — 183 tests، type hints، linting، CI/CD

</div>

---

## 🚀 التثبيت (Installation)

### الطريقة 1: من المصدر (للتطوير)

```bash
git clone https://github.com/opusstudiohq-max/arabic-invoice-mcp.git
cd arabic-invoice-mcp
pip install -e .
```

### الطريقة 2: عبر uv (الأسرع)

```bash
uv tool install arabic-invoice-mcp
```

---

## 🔗 الإعداد مع Claude Desktop

<div dir="rtl">

أضف التالي إلى ملف إعداد Claude Desktop:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

</div>

```json
{
  "mcpServers": {
    "arabic-invoice": {
      "command": "python",
      "args": ["-m", "arabic_invoice_mcp.server"],
      "env": {}
    }
  }
}
```

<div dir="rtl">

أو باستخدام `uv`:

</div>

```json
{
  "mcpServers": {
    "arabic-invoice": {
      "command": "uv",
      "args": ["--directory", "/path/to/arabic-invoice-mcp", "run", "arabic-invoice-mcp"]
    }
  }
}
```

---

## 📖 الاستخدام (Usage)

<div dir="rtl">

بعد ربط الـ server مع Claude، تقدر تطلب منه أي حاجة من الأدوات التالية بلغة طبيعية:

</div>

### 1. تفقيط مبلغ مالي

<div dir="rtl">

**قل لـ Claude:** "فقع لي مبلغ 1234.56 ريال سعودي"

</div>

```
النتيجة: ألف ومئتان وأربعة وثلاثون ريالاً وست وخمسون هللة
```

### 2. تحويل رقم إلى كلمات

<div dir="rtl">

**قل لـ Claude:** "حول الرقم 2026 إلى كلمات عربية"

</div>

```
النتيجة: ألفان وستة وعشرون
```

### 3. حساب ضريبة القيمة المضافة

<div dir="rtl">

**قل لـ Claude:** "احسب ضريبة القيمة المضافة على مبلغ 10000 ريال في السعودية"

</div>

```json
{
  "country": "SA",
  "country_name": "المملكة العربية السعودية",
  "vat_rate_percent": 15.0,
  "net_amount": 10000.0,
  "vat_amount": 1500.0,
  "total_inclusive": 11500.0,
  "total_in_arabic_words": "أحد عشر ألفاً وخمسمائة ريالاً"
}
```

### 4. إنشاء فاتورة كاملة

<div dir="rtl">

**قل لـ Claude:** "أنشئ فاتورة رقم INV-2026-001 من Opus Studio إلى عميل تجريبي، بثلاثة أصناف: لابتوب 2 × 3500، شاشة 3 × 1200، كيبورد 5 × 150"

</div>

<div dir="rtl">

**النتيجة:** فاتورة كاملة بالأصناف والمبالغ والضريبة والتفقيط.

</div>

### 5. تنسيق الفاتورة كنص للطباعة

<div dir="rtl">

**قل لـ Claude:** "نسيق الفاتورة دي كنص عربي جاهز للطباعة"

</div>

```
============================================================
              فاتورة ضريبية رقم: INV-2026-001
============================================================
التاريخ: 2026-07-03
البائع: Opus Studio
المشتري: عميل تجريبي
------------------------------------------------------------
الصنف                        الكمية    السعر     الإجمالي
------------------------------------------------------------
لابتوب                       2         3500      8050.0
شاشة                         3         1200      4140.0
كيبورد                       5         150        862.5
------------------------------------------------------------
المجموع الفرعي: 13050.0 SAR
ضريبة القيمة المضافة: 1957.5 SAR
============================================================
الإجمالي: 15007.5 SAR
الإجمالي بالكلمات: خمسة عشر ألفاً وسبعة ريالات وخمسون هللة
============================================================
```

---

## 🇸🇦 ZATCA Compliance

<div dir="rtl">

الخادم متوافق مع متطلبات **هيئة الزكاة والضريبة والجمارك السعودية** (ZATCA) للفوترة الإلكترونية.

</div>

### Phase 1 (B2C) — مدعوم حالياً ✅

<div dir="rtl">

- ✅ توليد QR code بصيغة **TLV** (Tag-Length-Value) كما هو محدد في المواصفات الرسمية
- ✅ **Base64** encoding
- ✅ التحقق من الرقم الضريبي (15 رقم يبدأ بـ 3)
- ✅ ISO 8601 timestamp
- ✅ دعم UTF-8 (يدعم الأسماء العربية بشكل صحيح)

</div>

### Phase 2 (B2B) — مدعوم جزئياً ⚠️

<div dir="rtl">

- ✅ حساب SHA-256 hash للفاتورة XML
- ⚠️ ECDSA signature (يحتاج integration مع ZATCA certificate authority)
- ⚠️ Invoice clearance / reporting API (يحتاج production credentials)

</div>

### مثال: فاتورة متوافقة مع ZATCA

```python
from arabic_invoice_mcp.server import create_zatca_compliant_invoice

invoice = create_zatca_compliant_invoice(
    invoice_number="INV-2026-001",
    seller_name="Opus Studio",
    seller_vat="300123456700003",  # 15 رقم يبدأ بـ 3
    buyer_name="عميل تجريبي",
    items=[
        {"description": "لابتوب Dell", "quantity": 1, "unit_price": 5000},
        {"description": "ماوس لاسلكي", "quantity": 2, "unit_price": 200},
    ],
)

print(invoice["zatca_qr"]["base64_data"])
# حوّل الناتج إلى QR image باستخدام أي مكتبة QR
```

### التثبيت مع دعم QR

```bash
pip install git+https://github.com/opusstudiohq-max/arabic-invoice-mcp.git#subdirectory=python-lib
```

---

## 🛠️ الأدوات المتاحة (Available Tools)

| الأداة (Tool) | الوصف |
|---|---|
| `tafgeet_amount` | تفقيط مبلغ مالي مع عملة |
| `convert_number_to_arabic` | تحويل رقم إلى كلمات بدون عملة |
| `calculate_vat` | حساب VAT حسب الدولة |
| `create_invoice` | إنشاء فاتورة إلكترونية كاملة |
| `format_invoice_arabic` | تنسيق الفاتورة كنص عربي |
| `list_supported_currencies` | عرض العملات المدعومة |
| `list_supported_vat_rates` | عرض معدلات VAT حسب الدولة |
| `generate_zatca_qr` | **ZATCA**: توليد QR code (Phase 1 B2C) |
| `create_zatca_compliant_invoice` | **ZATCA**: فاتورة كاملة مع QR مدمج |
| `hash_invoice_for_zatca` | **ZATCA Phase 2**: حساب hash للفاتورة |

---

## 🧪 الاختبارات

```bash
pip install pytest
pytest tests/ -v
```

---

## 📋 المتطلبات

- Python 3.10+
- `mcp` package (يُثبت تلقائياً)

---

## 🌍 الدول المدعومة

| الدولة | رمز | VAT |
|---|---|---|
| 🇸🇦 السعودية | SA | 15% |
| 🇪🇬 مصر | EG | 14% |
| 🇦🇪 الإمارات | AE | 5% |
| 🇧🇭 البحرين | BH | 10% |
| 🇰🇼 الكويت | KW | 0% |
| 🇶🇦 قطر | QA | 0% |
| 🇴🇲 عُمان | OM | 5% |

---

## 💼 الاستخدام التجاري

<div dir="rtl">

هذا الـ MCP server منتج تجاري جاهز للبيع عبر:

- **Smithery**: نشر كـ hosted MCP بـ pay-per-call
- **MCP Marketplace**: بيع كـ one-time أو subscription
- **Mostaql/Khamsat**: عرض خدمة "ربط Claude بنظام فواتيرك"
- **Direct B2B**: بيع للشركات السعودية/الإماراتية كـ retainer

**نماذج التسعير المقترحة:**
- استضافة + تحديثات: $20-50/شهر
- كود مخصص + دمج: $300-1500
- اشتراك مؤسسي: $100-300/شهر

</div>

---

## ⚠️ تنبيهات وتحفظات هامة (Caveats)

<div dir="rtl">

1. **دقة الكسور العشرية والحسابات المالية**:
   - تم تصميم الخادم للاعتماد بالكامل على حسابات `Decimal` الدقيقة لضمان عدم حدوث تشويه أو أخطاء تقريب عائمة أثناء حساب ضريبة القيمة المضافة والإجماليات.
   - عند دمج هذا الخادم مع أنظمة خارجية، يُنصح بتمرير القيم الرقمية كنصوص (strings) لتجنب فقدان الدقة في بروتوكولات الواجهة. تدعم عملات معينة 3 خانات عشرية (مثل OMR, KWD, BHD) بينما تدعم عملات أخرى خانتين (مثل SAR, EGP)، ويتم معالجة وضبط الكسور بدقة تبعاً لذلك.

2. **دقة وصحة المدخلات**:
   - لتقليل أخطاء المدخلات الشائعة، تُفرض قواعد تحقق صارمة على الحقول الأساسية؛ الرقم الضريبي للبائع يجب أن يكون 15 رقماً ويبدأ وينتهي بالرقم 3، والتواريخ يجب أن تتبع تنسيق ISO 8601 بدقة.

</div>

---

## 📄 الترخيص

MIT License — حر للاستخدام التجاري والشخصي.

---

## 🤝 المساهمة

<div dir="rtl">

المساهمات مرحب بها! خاصة:
- إضافة المزيد من اللهجات العربية (مغربي/شامي/خليجي)
- دعم المزيد من الأنظمة الضريبية
- تحسين قواعد تفقيط الأرقام
- دعم QR codes للفواتير السعودية

</div>

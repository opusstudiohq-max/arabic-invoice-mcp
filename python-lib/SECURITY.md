# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

لو لقيت ثغرة أمنية، **متفتحش Issue عام**. بدلاً من ذلك:

1. **Email**: security@example.com (أو أي email مذكور في GitHub profile)
2. **Subject**: `[SECURITY] arabic-invoice-mcp - وصف مختصر`
3. **Body**:
   - وصف للثغرة
   - خطوات إعادة الإنتاج
   - التأثير المحتمل
   - الإصدار المتأثر

## Response Timeline

- **24 ساعة**: Acknowledgment
- **7 أيام**: تقييم أولي
- **30 يوم**: Patch (للثغرات الحرجة) أو تاريخ مستهدف

## Security Best Practices للمستخدمين

### عند استخدام الـ MCP Server

1. **ما تضيفش folders حساسة** في Filesystem MCP
2. **استخدم API keys محدودة الصلاحيات** عند ربط APIs خارجية
3. **راجع الـ MCP config** قبل ما تحفظه — تأكد إن مفيش paths غريبة
4. **فعّل logging** للـ audit trail
5. **استخدم VPN** لو بتتعامل مع بيانات حساسة

### عند التعامل مع الفواتير

1. **ما تحفظش الرقم الضريبي** في plain text — استخدم encryption
2. **استخدم HTTPS/TLS** دائماً للـ API calls
3. **فعّل 2FA** على الحسابات اللي بتربطها بـ Claude
4. **راجع الـ access logs** شهرياً

### Private Data

- Claude AI (Anthropic) **لا يحتفظ ببياناتك** (حسب السياسة الرسمية)
- لكن تأكد من قراءة [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- لو بتتعامل مع بيانات GDPR، استشر legal advisor

## ZATCA Compliance Notes

- الـ QR code المولد متوافق مع ZATCA Phase 1 (B2C)
- للـ Phase 2 (B2B) ستحتاج:
  - Certificate من ZATCA
  - Cryptographic stamp (CSR/ECIES)
  - XML canonicalization
  - Invoice clearance أو reporting API

راجع [ZATCA E-Invoicing Specification](https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx) للتفاصيل.

## Known Security Considerations

- الـ MCP server بيدير inputs كـ Python objects — لازم تتحقق من الـ inputs في production
- الـ VAT number validation موجود، لكن ما بنعملش API lookup حقيقي (مش متاح public)
- الـ tafgeet function pure (مفيهاش side effects) — آمن للاستخدام في concurrent environments
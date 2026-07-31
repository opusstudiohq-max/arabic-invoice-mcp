# Contributing to Arabic Invoice MCP

شكراً لاهتمامك بالمساهمة! 🎉

## How to Contribute

### Reporting Bugs

افتح Issue على GitHub مع:
- وصف واضح للمشكلة
- خطوات إعادة الإنتاج (steps to reproduce)
- Expected vs actual behavior
- بيئة التشغيل (OS, Python version, MCP client)

### Suggesting Features

افتح Issue بعنوان `[Feature Request]` واشرح:
- المشكلة اللي بتحلها
- الحل المقترح
- أمثلة استخدام

### Pull Requests

1. Fork المستودع
2. أنشئ branch جديد: `git checkout -b feature/amazing-feature`
3. اكتب الـ tests أولاً (TDD)
4. اعمل commit: `git commit -m "feat: add amazing feature"`
5. تأكد إن كل الـ tests بتعدي: `pytest tests/`
6. اعمل push وافتح PR

### Coding Standards

- **Python**: 3.10+
- **Style**: Black + Ruff (متوفرين في dev deps)
- **Type hints**: مطلوبة لكل function
- **Tests**: pytest، coverage ≥ 80%
- **Docs**: كل function جديدة ليها docstring

### Commit Convention

نستخدم [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` ميزة جديدة
- `fix:` إصلاح bug
- `docs:` تغيير في الـ documentation
- `test:` إضافة tests
- `refactor:` إعادة هيكلة الكود بدون تغيير behavior
- `chore:` صيانة (deps, CI, etc.)

## Development Setup

```bash
git clone https://github.com/opusstudiohq-max/arabic-invoice-mcp.git
cd arabic-invoice-mcp
pip install -e ".[dev,qr]"
pytest tests/
```

## Areas Needing Help

- 🌍 إضافة لهجات عربية (مغربي، شامي، خليجي)
- 🏛️ دعم أنظمة ضريبية لدول أخرى (الأردن، العراق، فلسطين)
- 📱 TypeScript port للمطورين اللي بيشتغلوا بـ JS
- 🧪 إضافة property-based tests
- 🌐 ترجمة الـ README للغات إضافية
- 📚 Documentation site (MkDocs)
- 🎨 Landing page احترافية

## Code of Conduct

- كن محترماً و متعاوناً
- راجع الـ PRs بتاعتك بنفسك قبل ما تطلب review
- لو مش متأكد من حاجة، اسأل في Issue أولاً

## License

بالمساهمة في المشروع، أنت توافق إن مساهمتك هتكون تحت MIT License.
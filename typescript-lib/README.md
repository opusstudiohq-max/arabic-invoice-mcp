# arabic-invoice-mcp-ts

<div dir="rtl">

> نسخة TypeScript من Arabic Invoice MCP — 6 tools أساسية + ZATCA QR.

</div>

**TypeScript port** of [arabic-invoice-mcp (Python)](../python-lib/) — 6 core tools compatible with the Python version.

## ✨ المميزات

- ✅ **6 MCP tools** (نفس الـ Python API)
- ✅ **ZATCA QR** generator (TLV + Base64)
- ✅ **TypeScript 5.8+** (ESM)
- ✅ **Zod validation** للـ inputs
- ✅ **Strict mode** + full type safety
- ✅ **MCP SDK 1.29+** (stable v1)

## 🚀 التثبيت

```bash
# Install deps
npm install

# Build
npm run build

# Run (stdio transport)
npm start
```

## 🔗 إعداد Claude Desktop

```json
{
  "mcpServers": {
    "arabic-invoice-ts": {
      "command": "node",
      "args": ["/path/to/arabic-invoice-mcp-ts/dist/index.js"]
    }
  }
}
```

## 🛠️ الأدوات

| Tool | Description |
|---|---|
| `tafgeet_amount` | تفقيط مبلغ مالي |
| `convert_number_to_arabic` | تحويل رقم إلى كلمات |
| `calculate_vat` | حساب VAT حسب الدولة |
| `list_supported_currencies` | العملات المدعومة |
| `list_supported_vat_rates` | معدلات VAT |
| `generate_zatca_qr` | QR code متوافق مع ZATCA |

## 🧪 الاختبارات

```bash
npm test
```

## 📊 Parity with Python

| Feature | Python | TypeScript |
|---|---|---|
| Tafgeet engine | ✅ | ✅ |
| 5 currencies | ✅ | ✅ |
| 7 VAT countries | ✅ | ✅ |
| ZATCA QR (TLV) | ✅ | ✅ |
| Invoice creation | ✅ | 🔜 |
| Format invoice | ✅ | 🔜 |
| Date converter | ✅ | 🔜 |
| Saudi VAT Pro | ✅ | 🔜 |

## 🏗️ Architecture

```
arabic-invoice-mcp-ts/
├── src/
│   └── index.ts          # All tools + server
├── tests/
│   └── basic.test.ts     # Vitest
├── package.json
├── tsconfig.json
└── dist/                 # Build output
```

## 📝 License

MIT — نفس الـ Python version.
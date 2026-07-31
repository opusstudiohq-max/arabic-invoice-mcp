"""
مثال عملي: استخدام خادم MCP للفواتير العربية مباشرة من Python.
يُستخدم للاختبار اليدوي أو للتوثيق.
"""
from arabic_invoice_mcp.server import (
    tafgeet_amount,
    convert_number_to_arabic,
    calculate_vat,
    create_invoice,
    format_invoice_arabic,
    list_supported_currencies,
    list_supported_vat_rates,
)


def demo_tafgeet():
    print("\n" + "=" * 50)
    print("_demo 1: تفقيط المبالغ_")
    print("=" * 50)
    print(f"1234.56 SAR  →  {tafgeet_amount(1234.56, 'SAR')}")
    print(f"100.50 EGP   →  {tafgeet_amount(100.50, 'EGP')}")
    print(f"5000 AED     →  {tafgeet_amount(5000, 'AED')}")
    print(f"250000 KWD   →  {tafgeet_amount(250000, 'KWD')}")


def demo_number_conversion():
    print("\n" + "=" * 50)
    print("Demo 2: تحويل الأرقام")
    print("=" * 50)
    print(f"0         →  {convert_number_to_arabic(0)}")
    print(f"19        →  {convert_number_to_arabic(19)}")
    print(f"100       →  {convert_number_to_arabic(100)}")
    print(f"2026      →  {convert_number_to_arabic(2026)}")
    print(f"1000000   →  {convert_number_to_arabic(1000000)}")
    print(f"999999999 →  {convert_number_to_arabic(999999999)}")


def demo_vat():
    print("\n" + "=" * 50)
    print("Demo 3: حساب VAT")
    print("=" * 50)
    for country in ["SA", "EG", "AE", "BH", "KW"]:
        result = calculate_vat(10000, country)
        print(f"{result['country_name']}: 10000 → VAT={result['vat_amount']} → Total={result['total_inclusive']}")


def demo_full_invoice():
    print("\n" + "=" * 60)
    print("Demo 4: فاتورة كاملة")
    print("=" * 60)

    items = [
        {"description": "لابتوب Dell XPS", "quantity": 2, "unit_price": 4500},
        {"description": "شاشة Samsung 27\"", "quantity": 3, "unit_price": 1200},
        {"description": "كيبورد ميكانيكي", "quantity": 5, "unit_price": 350},
        {"description": "ماوس لاسلكي", "quantity": 10, "unit_price": 120},
    ]

    invoice = create_invoice(
        invoice_number="INV-2026-001",
        seller_name="أوبوس ستوديو للتقنية",
        seller_vat="300123456700003",
        buyer_name="عميل تجريبي للتجارة",
        buyer_vat="300987654300004",
        items=items,
        country="SA",
        currency="SAR",
        notes="الدفع خلال 30 يوم من تاريخ الفاتورة",
    )

    print(format_invoice_arabic(invoice))


def demo_supported():
    print("\n" + "=" * 50)
    print("Demo 5: العملات والدول المدعومة")
    print("=" * 50)
    print("\nالعملات:")
    for code, info in list_supported_currencies().items():
        print(f"  {code}: {info['singular']} (جمع: {info['plural']})")

    print("\nمعدلات VAT:")
    for code, info in list_supported_vat_rates().items():
        print(f"  {code} ({info['country_name']}): {info['vat_rate_percent']}%")


if __name__ == "__main__":
    demo_tafgeet()
    demo_number_conversion()
    demo_vat()
    demo_full_invoice()
    demo_supported()

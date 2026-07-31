"""
توليد فاتورة تجريبية كاملة مع QR code حقيقي.

الناتج:
- sample-invoice.txt: الفاتورة منسقة كنص عربي
- sample-invoice-qr.png: صورة QR code (لطباعتها على الفاتورة)
- sample-invoice-data.json: البيانات الكاملة بـ JSON
"""
import sys
import json
import base64
from pathlib import Path
from datetime import datetime, timezone

# Add src to path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from arabic_invoice_mcp.server import (
    create_invoice,
    format_invoice_arabic,
    tafgeet,
    calculate_vat,
)
from arabic_invoice_mcp.zatca_qr import create_zatca_qr, generate_qr_image


def main():
    print("=" * 60)
    print("توليد فاتورة تجريبية متوافق مع ZATCA")
    print("=" * 60)

    # 1) إنشاء فاتورة
    invoice = create_invoice(
        invoice_number="INV-2026-DEMO-001",
        seller_name="أوبوس ستوديو للتجارة والتوريدات",
        seller_vat="300123456700003",
        buyer_name="عميل تجريبي للحلول التقنية",
        buyer_vat="300987654300004",
        items=[
            {"description": "لابتوب Dell XPS 15", "quantity": 2, "unit_price": 5000},
            {"description": "شاشة Samsung 27 بوصة", "quantity": 3, "unit_price": 1200},
            {"description": "كيبورد ميكانيكي", "quantity": 5, "unit_price": 350},
            {"description": "ماوس لاسلكي Logitech", "quantity": 10, "unit_price": 180},
        ],
        country="SA",
        currency="SAR",
        notes="الدفع خلال 30 يوم من تاريخ الفاتورة. شكراً لتعاملكم معنا.",
    )

    # 2) تنسيق كنص
    formatted = format_invoice_arabic(invoice)
    print(formatted)

    # 3) توليد QR code
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    qr_result = create_zatca_qr(
        seller_name=invoice["seller"]["name"],
        vat_number=invoice["seller"]["vat"],
        timestamp=timestamp,
        total_with_vat=f"{invoice['total']:.2f}",
        vat_amount=f"{invoice['total_tax']:.2f}",
        output_image="sample-invoice-qr.png",
    )

    print("\n" + "=" * 60)
    print("QR Code Generated")
    print("=" * 60)
    print(f"Base64: {qr_result.base64_data}")
    print(f"Image: {qr_result.image_path}")
    print(f"TLV Hex: {qr_result.tlv_hex}")

    # 4) حفظ الملفات
    output_dir = Path(__file__).resolve().parent

    with open(output_dir / "sample-invoice.txt", "w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write("فاتورة تجريبية - متوافق مع ZATCA Phase 1 (B2C)\n")
        f.write(f"تاريخ الإنشاء: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 60 + "\n\n")
        f.write(formatted)
        f.write("\n\n")
        f.write("=" * 60 + "\n")
        f.write("QR Code Data (Base64):\n")
        f.write(qr_result.base64_data)
        f.write("\n\n")
        f.write("QR Code TLV (Hex) — for debugging:\n")
        f.write(qr_result.tlv_hex)
        f.write("\n")
        f.write("=" * 60 + "\n")

    with open(output_dir / "sample-invoice-data.json", "w", encoding="utf-8") as f:
        full_data = {
            "invoice": invoice,
            "qr_code": {
                "base64_data": qr_result.base64_data,
                "tlv_hex": qr_result.tlv_hex,
                "image_path": str(qr_result.image_path),
                "compliance": "ZATCA Phase 1 (B2C)",
                "timestamp": timestamp,
            },
        }
        json.dump(full_data, f, ensure_ascii=False, indent=2)

    print(f"\nFiles saved:")
    print(f"  - {output_dir / 'sample-invoice.txt'}")
    print(f"  - {output_dir / 'sample-invoice-qr.png'}")
    print(f"  - {output_dir / 'sample-invoice-data.json'}")


if __name__ == "__main__":
    main()
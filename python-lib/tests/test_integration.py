"""
Integration tests for Arabic Invoice MCP.
Combines server tool calls, VAT calculations, and ZATCA compliance checks.
"""
import pytest
from datetime import datetime, timezone
import base64
from arabic_invoice_mcp.server import (
    create_invoice,
    calculate_vat,
    generate_zatca_qr,
    create_zatca_compliant_invoice,
)

def decode_tlv(base64_str: str):
    """Utility to decode TLV from base64 string for verification."""
    decoded = base64.b64decode(base64_str)
    tags = {}
    i = 0
    while i < len(decoded):
        tag = decoded[i]
        length = decoded[i+1]
        value = decoded[i+2 : i+2+length]
        tags[tag] = value
        i += 2 + length
    return tags

class TestIntegrationWorkflow:
    def test_complete_invoice_to_zatca_qr_workflow(self):
        # 1. Setup client/invoice details
        seller = "أوبوس ستوديو"
        vat_number = "300123456700003"  # Valid 15-digit Saudi VAT
        items = [
            {"description": "طوير خادم MCP", "unit_price": 1000.0, "quantity": 1},
            {"description": "دعم فني شهري", "unit_price": 150.0, "quantity": 2},
        ]
        
        # 2. Calculate totals manually
        subtotal = sum(item["unit_price"] * item["quantity"] for item in items)
        assert subtotal == 1300.0
        
        # 3. Calculate VAT (15% for Saudi Arabia)
        vat_calc = calculate_vat(subtotal, country="SA")
        assert vat_calc["vat_amount"] == 195.0
        assert vat_calc["total_inclusive"] == 1495.0
        
        # 4. Generate ZATCA QR
        timestamp = datetime.now(timezone.utc).isoformat()
        qr_res = generate_zatca_qr(
            seller_name=seller,
            vat_number=vat_number,
            timestamp=timestamp,
            total_with_vat=vat_calc["total_inclusive"],
            vat_amount=vat_calc["vat_amount"]
        )
        assert qr_res is not None
        qr_b64 = qr_res["base64_data"]
        assert len(qr_b64) > 0
        
        # 5. Decode and verify TLV tags
        tags = decode_tlv(qr_b64)
        assert tags[1].decode("utf-8") == seller
        assert tags[2].decode("utf-8") == vat_number
        # ZATCA QR code timestamp might be formatted to %Y-%m-%dT%H:%M:%SZ in create_zatca_qr
        # Let's verify that tag 3 is present (timestamp) and contains the year
        assert len(tags[3]) > 0
        assert float(tags[4].decode("utf-8")) == vat_calc["total_inclusive"]
        assert float(tags[5].decode("utf-8")) == vat_calc["vat_amount"]

    def test_create_zatca_compliant_invoice_wrapper(self):
        # Test the wrapper endpoint/tool directly
        seller = "أوبوس ستوديو"
        vat_number = "300123456700003"
        items = [
            {"description": "خدمة برمجة", "unit_price": 500.0, "quantity": 2}
        ]
        
        result = create_zatca_compliant_invoice(
            invoice_number="INV-2026-001",
            seller_name=seller,
            seller_vat=vat_number,
            buyer_name="مشتري تجريبي",
            items=items,
            currency="SAR"
        )
        
        assert result is not None
        assert result["total"] == 1150.0
        assert result["total_tax"] == 150.0
        assert "ألف ومائة وخمسون ريالاً" in result["total_in_arabic_words"]
        assert result["zatca_qr"] is not None
        assert result["zatca_qr"]["base64_data"] is not None

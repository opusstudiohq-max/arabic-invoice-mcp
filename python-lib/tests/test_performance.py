"""
Performance and benchmark tests for Arabic Invoice MCP.
Verifies execution speeds for key operations (tafqeet < 50ms, invoice creation < 200ms).
"""
import pytest
import time
from arabic_invoice_mcp.server import (
    number_to_arabic_words,
    create_zatca_compliant_invoice,
)

class TestPerformanceBenchmarks:
    def test_tafqeet_performance(self):
        # 1. Warmup
        for _ in range(10):
            number_to_arabic_words(123456.78)
            
        # 2. Benchmark average of 500 runs
        start = time.perf_counter()
        runs = 500
        for _ in range(runs):
            number_to_arabic_words(987654321.45)
        duration = time.perf_counter() - start
        avg_ms = (duration / runs) * 1000
        
        print(f"\nAverage Tafqeet execution time: {avg_ms:.4f} ms")
        
        # Target: < 50ms (typically is < 1ms in Python)
        assert avg_ms < 50.0

    def test_invoice_creation_performance(self):
        seller = "أوبوس ستوديو"
        vat_number = "300123456700003"
        items = [
            {"description": "طوير خادم MCP", "unit_price": 1000.0, "quantity": 1},
            {"description": "دعم فني شهري", "unit_price": 150.0, "quantity": 2},
        ]
        
        # 1. Warmup
        for _ in range(5):
            create_zatca_compliant_invoice(
                invoice_number="INV-2026-001",
                seller_name=seller,
                seller_vat=vat_number,
                buyer_name="مشتري تجريبي",
                items=items,
                currency="SAR"
            )
            
        # 2. Benchmark average of 50 runs
        start = time.perf_counter()
        runs = 50
        for _ in range(runs):
            create_zatca_compliant_invoice(
                invoice_number="INV-2026-001",
                seller_name=seller,
                seller_vat=vat_number,
                buyer_name="مشتري تجريبي",
                items=items,
                currency="SAR"
            )
        duration = time.perf_counter() - start
        avg_ms = (duration / runs) * 1000
        
        print(f"Average Invoice + ZATCA QR creation execution time: {avg_ms:.4f} ms")
        
        # Target: < 200ms
        assert avg_ms < 200.0

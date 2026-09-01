"""
اختبار البنّاء.

الضمانة المطلوبة: **كل مستند يبنيه البنّاء يمرّ بالمُحقِّق** — وإلا فالبنّاء
يُنتج ما يُرفض. ولذلك الاختبار الأقوى هنا ليس حالة مفردة بل **عشوائي واسع
بمولّد حتمي**: مئات التوليفات، وكلها يجب أن تمرّ.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from eta_invoice.builder import (  # noqa: E402
    Address, BuildError, InvoiceBuilder, InvoiceLine, Party, Tax,
)
from eta_invoice.serialization import canonical_hash, load_document  # noqa: E402
from eta_invoice.validation import validate_document  # noqa: E402


def party(pid="113317713", name="منشأة الاختبار"):
    return Party(id=pid, name=name,
                 address=Address(governate="القاهرة", regionCity="مدينة نصر",
                                 street="شارع الطيران", buildingNumber="12", branchID="1"))


def simple_builder(**kw):
    return InvoiceBuilder(
        issuer=party(), receiver=party("313717919", "عميل"),
        internal_id="INV-1", activity_code="4620",
        issued_at=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc), **kw)


class TestBuildsValidDocuments:
    def test_minimal_invoice_passes_validation(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="خدمة", quantity=1, unit_price_egp="100.00",
                               total="114.00", taxes=[Tax("T1", rate=14)]))
        doc = b.build()
        assert validate_document(doc) == []
        assert doc["totalSalesAmount"] == 100.0
        assert doc["netAmount"] == 100.0
        assert doc["taxTotals"] == [{"taxType": "T1", "amount": 14.0}]
        assert doc["totalAmount"] == 114.0

    def test_discount_flows_into_net_and_tax_base(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="س", quantity=2, unit_price_egp="50.00",
                               discount_amount="10.00", discount_rate=10,
                               total="102.60", taxes=[Tax("T1", rate=14)]))
        doc = b.build()
        line = doc["invoiceLines"][0]
        assert line["salesTotal"] == 100.0
        assert line["netTotal"] == 90.0
        assert line["taxableItems"][0]["amount"] == 12.6   # 14% من 90 لا من 100

    def test_multiple_lines_and_tax_types_aggregate(self):
        b = simple_builder(extra_discount_amount="5.00")
        b.add_line(InvoiceLine(description="أ", quantity=1, unit_price_egp="100.00",
                               total="114.00", taxes=[Tax("T1", rate=14)]))
        b.add_line(InvoiceLine(description="ب", quantity=3, unit_price_egp="20.00",
                               total="70.80", taxes=[Tax("T1", rate=14), Tax("T2", rate=4)]))
        doc = b.build()
        by = {t["taxType"]: t["amount"] for t in doc["taxTotals"]}
        assert by["T1"] == pytest.approx(14.0 + 8.4)
        assert by["T2"] == pytest.approx(2.4)
        assert doc["totalAmount"] == pytest.approx(114.0 + 70.8 - 5.0)

    def test_fixed_tax_amount_without_rate(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="دمغة", quantity=1, unit_price_egp="100.00",
                               total="105.00", taxes=[Tax("T6", amount="5.00")]))
        doc = b.build()
        assert doc["taxTotals"][0]["amount"] == 5.0

    def test_foreign_currency_requires_conversion_fields(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="x", quantity=1, unit_price_egp="500.00",
                               total="500.00", currency_sold="USD",
                               amount_sold="10.00", exchange_rate="50.00"))
        doc = b.build()
        uv = doc["invoiceLines"][0]["unitValue"]
        assert uv["currencySold"] == "USD" and uv["currencyExchangeRate"] == 50.0

    def test_foreign_currency_missing_rate_is_rejected(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="x", quantity=1, unit_price_egp="500.00",
                               total="500.00", currency_sold="USD"))
        with pytest.raises(BuildError, match="عملة أجنبية"):
            b.build()


class TestSelfCheck:
    def test_empty_invoice_is_rejected(self):
        with pytest.raises(BuildError, match="بلا بنود"):
            simple_builder().build()

    def test_tax_without_rate_or_amount_is_rejected(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="x", quantity=1, unit_price_egp="10.00",
                               total="10.00", taxes=[Tax("T1")]))
        with pytest.raises(BuildError, match="بلا نسبة ولا مبلغ"):
            b.build()


class TestRandomisedGuarantee:
    """
    الضمانة الأساسية: **لا توليفة يبنيها البنّاء تُخفق في المُحقِّق.**
    مولّد حتمي ببذرة ثابتة — لا Math.random، فالاختبار يجب أن يُعاد إنتاجه.
    """

    def test_two_hundred_random_invoices_all_validate(self):
        rnd = random.Random(20260901)
        for i in range(200):
            b = simple_builder(extra_discount_amount=f"{rnd.randrange(0, 500) / 100:.2f}")
            running = Decimal(0)
            for _ in range(rnd.randint(1, 5)):
                qty = rnd.randint(1, 40)
                price = Decimal(rnd.randrange(50, 500_00)) / 100
                disc = Decimal(rnd.randrange(0, 2000)) / 100
                sales = (Decimal(qty) * price).quantize(Decimal("0.01"))
                disc = min(disc, sales)
                net = sales - disc
                taxes = [Tax("T1", rate=14)] if rnd.random() < 0.8 else []
                if rnd.random() < 0.3:
                    taxes.append(Tax("T2", rate=5))
                tax_sum = sum((net * Decimal(t.rate) / 100).quantize(Decimal("0.01"))
                              for t in taxes)
                total = (net + tax_sum).quantize(Decimal("0.01"))
                running += total
                b.add_line(InvoiceLine(
                    description=f"بند {i}", quantity=qty, unit_price_egp=str(price),
                    discount_amount=str(disc), total=str(total), taxes=taxes))
            doc = b.build()                       # يرمي لو أخفق فحصه لنفسه
            assert validate_document(doc) == []


class TestEndToEnd:
    def test_built_document_serializes_and_hashes(self):
        b = simple_builder()
        b.add_line(InvoiceLine(description="خدمة استشارية", quantity=1,
                               unit_price_egp="1000.00", total="1140.00",
                               taxes=[Tax("T1", rate=14)]))
        doc = b.build()
        h = canonical_hash(doc)
        assert len(h) == 64 and h == h.upper()

    def test_hash_changes_when_any_amount_changes(self):
        def make(price):
            b = simple_builder()
            net = Decimal(price)
            b.add_line(InvoiceLine(description="س", quantity=1, unit_price_egp=price,
                                   total=str((net * Decimal("1.14")).quantize(Decimal("0.01"))),
                                   taxes=[Tax("T1", rate=14)]))
            return canonical_hash(b.build())
        assert make("100.00") != make("100.01")

    def test_json_round_trip_preserves_hash(self):
        import json
        b = simple_builder()
        b.add_line(InvoiceLine(description="س", quantity=2, unit_price_egp="33.33",
                               total="75.99", taxes=[Tax("T1", rate=14)]))
        doc = b.build()
        reloaded = load_document(json.dumps(doc, ensure_ascii=False))
        assert canonical_hash(doc) == canonical_hash(reloaded)

"""
اختبارات Saudi VAT Calculator Pro
"""
import pytest
from arabic_invoice_mcp.saudi_vat_pro import (
    get_vat_rate_for_date,
    calculate_excise_tax,
    calculate_gosi,
    calculate_invoice_with_discount,
    calculate_reverse_charge,
    vat_period_summary,
    VAT_HISTORY,
    EXCISE_RATES,
    GOSI_RATES,
)


class TestVATHistory:
    def test_vat_5_percent_period(self):
        result = get_vat_rate_for_date("2018-06-15")
        assert result["rate_percent"] == 5.0

    def test_vat_15_percent_current(self):
        result = get_vat_rate_for_date("2024-01-01")
        assert result["rate_percent"] == 15.0

    def test_vat_at_transition_date(self):
        """يوم 2020-07-01 هو أول يوم بنسبة 15%"""
        result = get_vat_rate_for_date("2020-07-01")
        assert result["rate_percent"] == 15.0

    def test_vat_day_before_transition(self):
        """يوم 2020-06-30 هو آخر يوم بنسبة 5%"""
        result = get_vat_rate_for_date("2020-06-30")
        assert result["rate_percent"] == 5.0

    def test_vat_before_introduction(self):
        result = get_vat_rate_for_date("2017-12-31")
        assert result["rate_percent"] == 0.0

    def test_invalid_date(self):
        result = get_vat_rate_for_date("not-a-date")
        assert "error" in result


class TestExciseTax:
    def test_tobacco_100_percent(self):
        result = calculate_excise_tax("tobacco", 100, 1)
        assert result["excise_rate_percent"] == 100.0
        assert result["excise_amount"] == 100.0
        assert result["total_price_incl_excise"] == 200.0

    def test_soft_drinks_50_percent(self):
        result = calculate_excise_tax("soft_drinks", 5, 10)
        assert result["excise_rate_percent"] == 50.0
        assert result["total_price_excise_excl"] == 50.0
        assert result["excise_amount"] == 25.0

    def test_invalid_product(self):
        result = calculate_excise_tax("invalid", 100, 1)
        assert "error" in result

    def test_quantity_zero(self):
        result = calculate_excise_tax("tobacco", 100, 0)
        assert result["excise_amount"] == 0.0


class TestGOSI:
    def test_saudi_employee_deduction(self):
        """موظف سعودي براتب 10,000 ريال"""
        result = calculate_gosi(10000, saudi_nationality=True)
        # 9.75% من 10000 = 975
        assert result["employee_gosi_deduction"] == 975.0
        assert result["net_salary"] == 9025.0

    def test_non_saudi_employee(self):
        """موظف غير سعودي يدفع 2% فقط"""
        result = calculate_gosi(10000, saudi_nationality=False)
        assert result["employee_gosi_deduction"] == 200.0
        assert result["net_salary"] == 9800.0

    def test_negative_salary_rejected(self):
        result = calculate_gosi(-1000)
        assert "error" in result


class TestInvoiceWithDiscount:
    def test_discount_before_vat(self):
        items = [
            {"description": "صنف 1", "quantity": 2, "unit_price": 1000},
            {"description": "صنف 2", "quantity": 1, "unit_price": 500},
        ]
        result = calculate_invoice_with_discount(items, discount_percent=10)
        assert result["subtotal"] == 2500.0
        assert result["discount_amount"] == 250.0  # 10% من 2500
        assert result["net_before_vat"] == 2250.0
        assert result["vat_amount"] == round(2250.0 * 0.15, 2)  # 337.5

    def test_discount_after_vat(self):
        items = [{"description": "صنف", "quantity": 1, "unit_price": 1000}]
        result = calculate_invoice_with_discount(
            items, discount_percent=10, discount_before_vat=False
        )
        assert result["subtotal"] == 1000.0
        # VAT أولاً: 1000 + 150 = 1150
        # ثم خصم 10%: 1150 - 115 = 1035
        assert result["total_incl_vat"] == 1035.0

    def test_invalid_discount_percentage(self):
        result = calculate_invoice_with_discount(
            [{"description": "x", "quantity": 1, "unit_price": 100}],
            discount_percent=150,  # أكبر من 100
        )
        assert "error" in result


class TestReverseCharge:
    def test_international_service_with_registered_recipient(self):
        result = calculate_reverse_charge(
            service_value=10000,
            service_provider_country="EG",
            service_recipient_country="SA",
            recipient_vat_registered=True,
        )
        assert result["applies"] is True
        assert result["total_to_pay_provider"] == 10000.0  # بدون VAT للمقدم
        assert result["total_reported_by_recipient"] == 11500.0  # 10000 + 15% VAT

    def test_local_service_no_reverse_charge(self):
        result = calculate_reverse_charge(
            service_value=1000,
            service_provider_country="SA",
            service_recipient_country="SA",
            recipient_vat_registered=True,
        )
        assert result["applies"] is False

    def test_unregistered_recipient_no_reverse_charge(self):
        result = calculate_reverse_charge(
            service_value=1000,
            service_provider_country="EG",
            service_recipient_country="SA",
            recipient_vat_registered=False,
        )
        assert result["applies"] is False


class TestVATPeriodSummary:
    def test_payable_vat(self):
        result = vat_period_summary(
            total_sales=100000,
            total_purchases=30000,
        )
        assert result["output_vat_15"] == 15000.0
        assert result["input_vat_15"] == 4500.0
        assert result["net_vat_payable"] == 10500.0
        assert "مستحقة للدفع" in result["note"]

    def test_refundable_vat(self):
        result = vat_period_summary(
            total_sales=10000,
            total_purchases=50000,
        )
        assert result["net_vat_payable"] == -6000.0
        assert "قابلة للاسترداد" in result["note"]
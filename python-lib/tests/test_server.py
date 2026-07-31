"""
اختبارات خادم MCP للفواتير العربية وتفقيط الأرقام.
"""
import pytest
from arabic_invoice_mcp.server import (
    tafgeet,
    number_to_arabic_words,
    tafgeet_amount,
    convert_number_to_arabic,
    calculate_vat,
    create_invoice,
    format_invoice_arabic,
    list_supported_currencies,
    list_supported_vat_rates,
)


# =============================================================================
# Tests: Number to Arabic Words
# =============================================================================

class TestNumberToArabicWords:
    def test_zero(self):
        assert number_to_arabic_words(0) == "صفر"

    def test_single_digit(self):
        assert number_to_arabic_words(5) == "خمسة"

    def test_teens(self):
        assert number_to_arabic_words(15) == "خمسة عشر"

    def test_tens(self):
        assert "عشرون" in number_to_arabic_words(20)

    def test_hundreds(self):
        result = number_to_arabic_words(100)
        assert "مائة" in result

    def test_thousands(self):
        result = number_to_arabic_words(2000)
        assert "ألف" in result

    def test_millions(self):
        result = number_to_arabic_words(1000000)
        assert "مليون" in result

    def test_billions(self):
        result = number_to_arabic_words(2000000000)
        assert "مليار" in result

    def test_complex_number(self):
        result = number_to_arabic_words(1234)
        assert "ألف" in result and "أربعة" in result

    def test_negative(self):
        result = number_to_arabic_words(-5)
        assert "سالب" in result


# =============================================================================
# Tests: Tafgeet (currency)
# =============================================================================

class TestTafgeet:
    def test_basic_sar(self):
        result = tafgeet(100, "SAR")
        assert "مائة" in result and "ريال" in result

    def test_with_hellala(self):
        result = tafgeet(100.50, "SAR")
        assert "هللة" in result or "هللات" in result

    def test_egp(self):
        result = tafgeet(50, "EGP")
        assert "جنيه" in result

    def test_aed(self):
        result = tafgeet(75, "AED")
        assert "درهم" in result

    def test_one_unit(self):
        result = tafgeet(1, "SAR")
        assert "ريال" in result

    def test_two_units(self):
        result = tafgeet(2, "SAR")
        assert "ريال" in result

    def test_plurals_3_to_10(self):
        result = tafgeet(5, "SAR")
        assert "ريالات" in result

    def test_unsupported_currency(self):
        with pytest.raises(ValueError, match="غير مدعومة"):
            tafgeet(100, "XYZ")

    def test_tafgeet_amount_tool(self):
        result = tafgeet_amount(1234.56, "SAR")
        assert isinstance(result, str) and len(result) > 0

    def test_convert_number_tool(self):
        result = convert_number_to_arabic(2026)
        assert isinstance(result, str) and "ألف" in result


# =============================================================================
# Tests: VAT Calculation
# =============================================================================

class TestVAT:
    def test_saudi_vat(self):
        result = calculate_vat(10000, "SA")
        assert result["vat_amount"] == 1500.0
        assert result["total_inclusive"] == 11500.0

    def test_egypt_vat(self):
        result = calculate_vat(1000, "EG")
        assert result["vat_amount"] == 140.0

    def test_uae_vat(self):
        result = calculate_vat(1000, "AE")
        assert result["vat_amount"] == 50.0

    def test_zero_vat_country(self):
        result = calculate_vat(1000, "KW")
        assert result["vat_amount"] == 0.0

    def test_total_in_words(self):
        result = calculate_vat(10000, "SA")
        assert "total_in_arabic_words" in result
        assert len(result["total_in_arabic_words"]) > 0

    def test_list_vat_rates(self):
        result = list_supported_vat_rates()
        assert "SA" in result
        assert result["SA"]["vat_rate_percent"] == 15.0


# =============================================================================
# Tests: Invoice Creation
# =============================================================================

class TestInvoice:
    def _sample_items(self):
        return [
            {"description": "لابتوب", "quantity": 2, "unit_price": 3500},
            {"description": "شاشة", "quantity": 3, "unit_price": 1200},
        ]

    def test_create_invoice_basic(self):
        result = create_invoice(
            invoice_number="INV-001",
            seller_name="بائع",
            buyer_name="مشتري",
            items=self._sample_items(),
        )
        assert result["invoice_number"] == "INV-001"
        assert result["subtotal"] == 10600.0
        assert result["total"] > result["subtotal"]

    def test_invoice_total_in_words(self):
        result = create_invoice(
            invoice_number="INV-001",
            seller_name="بائع",
            buyer_name="مشتري",
            items=self._sample_items(),
        )
        assert "total_in_arabic_words" in result
        assert len(result["total_in_arabic_words"]) > 0

    def test_invoice_with_vat_numbers(self):
        result = create_invoice(
            invoice_number="INV-002",
            seller_name="Opus Studio",
            buyer_name="عميل تجريبي",
            items=self._sample_items(),
            seller_vat="300000000000003",
            buyer_vat="300000000000004",
        )
        assert result["seller"]["vat"] == "300000000000003"
        assert result["buyer"]["vat"] == "300000000000004"

    def test_invoice_country_specific_tax(self):
        # Egyptian invoice should use 14%
        result = create_invoice(
            invoice_number="INV-EG-001",
            seller_name="بائع",
            buyer_name="مشتري",
            items=[{"description": "خدمة", "quantity": 1, "unit_price": 1000}],
            country="EG",
        )
        assert result["total_tax"] == 140.0

    def test_invoice_items_count(self):
        result = create_invoice(
            invoice_number="INV-003",
            seller_name="بائع",
            buyer_name="مشتري",
            items=self._sample_items(),
        )
        assert len(result["items"]) == 2


# =============================================================================
# Tests: Format Invoice
# =============================================================================

class TestFormatInvoice:
    def test_format_returns_string(self):
        invoice = create_invoice(
            invoice_number="INV-001",
            seller_name="بائع",
            buyer_name="مشتري",
            items=[{"description": "صنف", "quantity": 1, "unit_price": 100}],
        )
        formatted = format_invoice_arabic(invoice)
        assert isinstance(formatted, str)
        assert "INV-001" in formatted
        assert "بائع" in formatted
        assert "مشتري" in formatted

    def test_format_contains_totals(self):
        invoice = create_invoice(
            invoice_number="INV-002",
            seller_name="بائع",
            buyer_name="مشتري",
            items=[{"description": "صنف", "quantity": 1, "unit_price": 100}],
        )
        formatted = format_invoice_arabic(invoice)
        assert "الإجمالي" in formatted
        assert "ضريبة" in formatted


# =============================================================================
# Tests: Supported currencies
# =============================================================================

class TestCurrencies:
    def test_list_currencies(self):
        result = list_supported_currencies()
        assert "SAR" in result
        assert "EGP" in result
        assert "AED" in result
        assert "USD" in result
        assert "KWD" in result

    def test_currency_has_fields(self):
        result = list_supported_currencies()
        sar = result["SAR"]
        assert "singular" in sar
        assert "plural" in sar
        assert "fraction_singular" in sar


# =============================================================================
# Tests: Arabic Grammar & 3-Decimal Currencies
# =============================================================================

class TestArabicGrammarAnd3Decimals:
    def test_double_feminine_fraction_sar(self):
        # 1. Ensure "هللتان" is returned instead of "هللةتان"
        assert tafgeet(0.02, "SAR") == "هللتان"

    def test_double_feminine_fraction_omr(self):
        # 2. Ensure "بيستان" is returned instead of "بيسةتان"
        assert tafgeet(0.002, "OMR") == "بيستان"

    def test_double_feminine_fraction_aed(self):
        # 3. Ensure "فلسان" is returned instead of "فلسين/فلسةتان"
        assert tafgeet(0.02, "AED") == "فلسان"

    def test_double_feminine_fraction_kwd(self):
        # 4. Ensure "فلسان" is returned instead of "فلسين/فلسةتان" for 3-decimal KWD
        assert tafgeet(0.002, "KWD") == "فلسان"

    def test_gender_agreement_masculine_singular_sar(self):
        # 5. Verify "واحد" is used for masculine currency: "ريال واحد"
        assert tafgeet(1.0, "SAR") == "ريال واحد"

    def test_gender_agreement_masculine_singular_egp(self):
        # 6. Verify "واحد" is used for masculine currency: "جنيه واحد"
        assert tafgeet(1.0, "EGP") == "جنيه واحد"

    def test_gender_agreement_masculine_singular_aed(self):
        # 7. Verify "واحد" is used for masculine currency: "درهم واحد"
        assert tafgeet(1.0, "AED") == "درهم واحد"

    def test_gender_agreement_fraction_one_feminine(self):
        # 8. Verify "واحدة" is used for feminine subunit: "هللة واحدة"
        assert tafgeet(0.01, "SAR") == "هللة واحدة"

    def test_gender_agreement_fraction_one_masculine_aed(self):
        # 9. Verify "واحد" is used for masculine subunit: "فلس واحد"
        assert tafgeet(0.01, "AED") == "فلس واحد"

    def test_gender_agreement_fraction_one_masculine_kwd(self):
        # 10. Verify "واحد" is used for masculine subunit: "فلس واحد"
        assert tafgeet(0.001, "KWD") == "فلس واحد"

    def test_gender_agreement_fraction_plural_feminine_sar(self):
        # 11. Verify "ثلاث هللات" (feminine unit matches masculine number "ثلاث")
        assert tafgeet(0.03, "SAR") == "ثلاث هللات"

    def test_gender_agreement_fraction_plural_feminine_omr(self):
        # 12. Verify "خمس بيسات" (feminine unit matches masculine number "خمس")
        assert tafgeet(0.005, "OMR") == "خمس بيسات"

    def test_gender_agreement_fraction_plural_masculine_egp(self):
        # 13. Verify "ثلاثة قروش" (masculine unit matches feminine number "ثلاثة")
        assert tafgeet(0.03, "EGP") == "ثلاثة قروش"

    def test_gender_agreement_fraction_plural_masculine_kwd(self):
        # 14. Verify "خمسة فلوس" (masculine unit matches feminine number "خمسة")
        assert tafgeet(0.005, "KWD") == "خمسة فلوس"

    def test_grammar_ending_hundreds_sar(self):
        # 15. "مائة ريال" instead of "مائة ريالاً"
        assert tafgeet(100.0, "SAR") == "مائة ريال"

    def test_grammar_ending_thousands_egp(self):
        # 16. "ألف جنيه" instead of "ألف جنيهاً"
        assert tafgeet(1000.0, "EGP") == "ألف جنيه"

    def test_grammar_ending_dual_idafa_hundreds_sar(self):
        # 17. "مئتا ريال" instead of "مئتان ريال"
        assert tafgeet(200.0, "SAR") == "مئتا ريال"

    def test_grammar_ending_dual_idafa_thousands_aed(self):
        # 18. "ألفا درهم" instead of "ألفان درهم"
        assert tafgeet(2000.0, "AED") == "ألفا درهم"

    def test_grammar_ending_dual_idafa_millions_egp(self):
        # 19. "مليونا جنيه" instead of "مليونان جنيه"
        assert tafgeet(2000000.0, "EGP") == "مليونا جنيه"

    def test_three_decimal_kwd_splitting(self):
        # 20. Test 3-decimal KWD splitting
        assert tafgeet(12.345, "KWD") == "اثنا عشر ديناراً وثلاثمائة وخمسة وأربعون فلساً"

    def test_three_decimal_omr_splitting(self):
        # 21. Test 3-decimal OMR splitting
        assert tafgeet(12.005, "OMR") == "اثنا عشر ريالاً وخمس بيسات"

    def test_three_decimal_bhd_splitting(self):
        # 22. Test 3-decimal BHD splitting
        assert tafgeet(10.050, "BHD") == "عشرة دنانير وخمسون فلساً"

    def test_three_decimal_fraction_hundreds_kwd(self):
        # 23. Test 100, 200, 300 etc. in 3-decimal fraction: 0.200 KWD -> "مئتا فلس"
        assert tafgeet(0.200, "KWD") == "مئتا فلس"

    def test_three_decimal_fraction_thousand_kwd(self):
        # 24. Test exactly 1000 fils is rounded / treated as 1 KWD
        assert tafgeet(0.9999, "KWD") == "دينار واحد"


class TestServerWS1:
    def test_decimal_precision_tafgeet(self):
        # Test precision edge cases that can fail with float division
        # 1.10 - 1.00 is 0.10000000000000009 in float, but Decimal handles it cleanly.
        assert "عشر هللات" in tafgeet(1.10, "SAR")
        assert "عشر هللات" in tafgeet(0.10, "SAR")

    def test_generate_zatca_qr_raises_value_error(self):
        from arabic_invoice_mcp.server import generate_zatca_qr
        with pytest.raises(ValueError):
            generate_zatca_qr(
                seller_name="",  # invalid name
                vat_number="300123456700003",
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat=100.0,
                vat_amount=15.0
            )

        with pytest.raises(ValueError):
            generate_zatca_qr(
                seller_name="Opus Studio",
                vat_number="300123456700003",
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat=-5.0,  # negative total
                vat_amount=15.0
            )


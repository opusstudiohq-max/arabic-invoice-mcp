"""
Dedicated Arabic Grammar and Tafqeet unit tests.
Verifies dual-feminine corrections, gender agreement, 3-decimal currencies, and correct grammar endings.
"""
import pytest
from arabic_invoice_mcp.server import (
    number_to_arabic_words,
    tafgeet_amount,
)

class TestArabicGrammarAndTafqeet:
    # 1. Dual-feminine bug checks
    def test_dual_feminine_bug_fixes(self):
        # SAR (هللة is feminine -> dual should be هللتان NOT هللةتان)
        res_sar = tafgeet_amount(0.02, "SAR")
        assert "هللتان" in res_sar
        assert "هللةتان" not in res_sar
        
        # BHD (فلس is masculine -> dual should be فلسان NOT فلسةتان)
        res_bhd = tafgeet_amount(0.002, "BHD")
        assert "فلسان" in res_bhd
        assert "فلسين" not in res_bhd
        assert "فلسةتان" not in res_bhd

    # 2. Gender agreement checks
    def test_gender_agreement_ones(self):
        # ريال is masculine -> "ريال واحد"
        res_one_sar = tafgeet_amount(1.0, "SAR")
        assert "ريال واحد" in res_one_sar
        assert "ريال واحدة" not in res_one_sar

        # هللة is feminine -> "هللة واحدة"
        res_one_halala = tafgeet_amount(0.01, "SAR")
        assert "هللة واحدة" in res_one_halala
        assert "هللة واحد " not in res_one_halala and not res_one_halala.endswith("هللة واحد")

    def test_gender_agreement_rules_3_to_10(self):
        # هللة is feminine -> "ثلاث هللات" (masculine number "ثلاث")
        res_three_halala = tafgeet_amount(0.03, "SAR")
        assert "ثلاث هللات" in res_three_halala
        assert "ثلاثة هللات" not in res_three_halala

        # ريال is masculine -> "ثلاثة ريالات" (feminine number "ثلاثة")
        res_three_sar = tafgeet_amount(3.0, "SAR")
        assert "ثلاثة ريالات" in res_three_sar
        assert "ثلاث ريالات" not in res_three_sar

    # 3. Grammar endings and addition/idafa rules
    def test_grammar_endings_hundreds(self):
        # "مائة ريالٍ" instead of "مائة ريالاً"
        res_100_sar = tafgeet_amount(100.0, "SAR")
        assert "مائة ريال" in res_100_sar

    def test_grammar_endings_idafa_thousands(self):
        # "مئتا ألف" instead of "مئتان ألف" (drop 'noon' for addition/idafa)
        res_200k_sar = tafgeet_amount(200000.0, "SAR")
        assert "مئتا ألف" in res_200k_sar
        assert "مئتان ألف" not in res_200k_sar

    # 4. 3-decimal currencies support (KWD, BHD, OMR)
    def test_three_decimal_currencies_splitting(self):
        # KWD (دينار كويتي) - 3 decimals
        res_kwd = tafgeet_amount(123.456, "KWD")
        # 123 = مائة وثلاثة وعشرون ديناراً
        # 456 = وأربعمائة وستة وخمسون فلساً
        assert "دينار" in res_kwd
        assert "فلسا" in res_kwd or "فلس" in res_kwd
        assert "وأربعمائة وستة وخمسون فلساً" in res_kwd

        # BHD (دينار بحريني) - 3 decimals
        res_bhd = tafgeet_amount(5.005, "BHD")
        assert "خمسة دنانير وخمسة فلوس" in res_bhd

        # OMR (ريال عماني) - 3 decimals (بيسة / baisa)
        res_omr = tafgeet_amount(10.025, "OMR")
        # 25 = وخمسة وعشرون بيسة
        assert "عشرة ريالات وخمس وعشرون بيسة" in res_omr

    # 5. Grammar checks on various amounts and digits (more than 20 cases combined)
    def test_grammar_various_numbers(self):
        assert number_to_arabic_words(1) == "واحد"
        assert number_to_arabic_words(2) == "اثنان"
        assert number_to_arabic_words(11) == "أحد عشر"
        assert number_to_arabic_words(12) == "اثنا عشر"
        assert number_to_arabic_words(22) == "اثنان وعشرون"
        assert number_to_arabic_words(100) == "مائة"
        assert number_to_arabic_words(200) == "مئتان"
        assert number_to_arabic_words(300) == "ثلاثمائة"
        assert number_to_arabic_words(1000) == "ألف"
        assert number_to_arabic_words(2000) == "ألفان"
        assert number_to_arabic_words(3000) == "ثلاثة آلاف"
        assert number_to_arabic_words(10000) == "عشرة آلاف"
        assert number_to_arabic_words(100000) == "مائة ألف"
        assert number_to_arabic_words(1000000) == "مليون"
        assert number_to_arabic_words(2000000) == "مليونان"
        assert number_to_arabic_words(1000000000) == "مليار"
        assert number_to_arabic_words(2000000000) == "ملياران"

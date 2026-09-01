"""
اختبار المُحقِّق.

الاختبار الأهم أولاً: **العيّنة الرسمية يجب أن تمرّ بلا ملاحظة واحدة.**
لأن مُحقِّقاً يرفض مستند الهيئة نفسه لا يُصلح لشيء — والإنذار الكاذب يُفقده
الثقة فيُهمَل، وحينها لا يمنع رفضاً أبداً.
"""
from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from eta_invoice.validation import (  # noqa: E402
    UNRESOLVED,
    format_report,
    validate_document,
)

FIXTURE = ROOT / "fixtures" / "one-doc.json"


@pytest.fixture
def official():
    if not FIXTURE.exists():
        pytest.skip("العيّنة الرسمية غير موجودة")
    return json.loads(FIXTURE.read_text(encoding="utf-8-sig"))


class TestNoFalsePositives:
    """الشرط الأول: لا نُنذر على ما هو صحيح."""

    def test_official_sample_passes_clean(self, official):
        findings = validate_document(official)
        assert findings == [], "المُحقِّق يرفض عيّنة الهيئة الرسمية:\n" + format_report(findings)

    def test_report_says_clean(self, official):
        assert "لا ملاحظات" in format_report(validate_document(official))


class TestCatchesRealErrors:
    """ولكل قاعدة اختبارها، فيُعرف أيّها انكسر."""

    def test_sales_total_mismatch(self, official):
        d = deepcopy(official)
        d["invoiceLines"][0]["salesTotal"] = 999.99
        paths = [f.path for f in validate_document(d)]
        assert "invoiceLines[0].salesTotal" in paths

    def test_net_total_mismatch(self, official):
        d = deepcopy(official)
        d["invoiceLines"][0]["netTotal"] = 1.0
        assert any("netTotal" in f.path for f in validate_document(d))

    def test_document_sales_sum_mismatch(self, official):
        d = deepcopy(official)
        d["totalSalesAmount"] = 1.0
        assert any(f.path == "totalSalesAmount" for f in validate_document(d))

    def test_net_amount_mismatch(self, official):
        d = deepcopy(official)
        d["netAmount"] = 0
        assert any(f.path == "netAmount" for f in validate_document(d))

    def test_tax_total_mismatch(self, official):
        d = deepcopy(official)
        d["taxTotals"][0]["amount"] = 0.01
        assert any("taxTotals[0]" in f.path for f in validate_document(d))

    def test_tax_type_present_in_lines_but_missing_from_totals(self, official):
        d = deepcopy(official)
        d["taxTotals"] = [t for t in d["taxTotals"] if t["taxType"] != "T1"]
        f = [x for x in validate_document(d) if "T1" in x.message]
        assert f and "غائب" in f[0].actual

    def test_total_amount_mismatch(self, official):
        d = deepcopy(official)
        d["totalAmount"] = 7
        assert any(f.path == "totalAmount" for f in validate_document(d))

    def test_empty_document_is_rejected(self):
        f = validate_document({})
        assert f and f[0].path == "invoiceLines"


class TestMessageQuality:
    """
    الرسالة هي المنتج. الشكوى الموثّقة ليست الرفض بل الرفض **بلا تشخيص** —
    فكل ملاحظة تحمل الفارق وطريقة الإصلاح.
    """

    def test_finding_reports_the_difference(self, official):
        d = deepcopy(official)
        stated = d["totalAmount"]
        d["totalAmount"] = float(stated) + 3
        f = next(x for x in validate_document(d) if x.path == "totalAmount")
        assert "الفارق" in f.fix and "3" in f.fix
        assert f.expected and f.actual

    def test_finding_names_the_formula(self, official):
        d = deepcopy(official)
        d["netAmount"] = 0
        f = next(x for x in validate_document(d) if x.path == "netAmount")
        assert "totalSalesAmount" in f.fix and "totalDiscountAmount" in f.fix


class TestDecimalNotFloat:
    """مقارنة المال بالعائم هي «أخطاء التقريب» بعينها."""

    def test_classic_float_trap_does_not_produce_a_false_finding(self):
        doc = {
            "invoiceLines": [
                {"quantity": 3, "unitValue": {"amountEGP": 0.1},
                 "salesTotal": 0.3, "netTotal": 0.3, "discount": {"amount": 0}},
            ],
            "totalSalesAmount": 0.3, "totalDiscountAmount": 0, "netAmount": 0.3,
            "taxTotals": [], "totalAmount": 0.3,
        }
        doc["invoiceLines"][0]["total"] = 0.3
        paths = [f.path for f in validate_document(doc)]
        assert "invoiceLines[0].salesTotal" not in paths, "0.1×3 عُوملت كعائم"


class TestHonesty:
    """ما لم يُشتقّ لا يُفحص — ويُذكر صراحةً."""

    def test_unresolved_rule_is_declared(self):
        assert "line.total" in UNRESOLVED
        assert "912" in UNRESOLVED["line.total"], "الدليل العددي غير مذكور"

    def test_unresolved_rule_is_not_enforced(self, official):
        """تغيير line.total وحده لا يُنتج ملاحظة على البند — القاعدة غير محسومة."""
        d = deepcopy(official)
        d["invoiceLines"][0]["total"] = 12345.67
        d["totalAmount"] = sum(l["total"] for l in d["invoiceLines"]) - d["extraDiscountAmount"]
        line_findings = [f for f in validate_document(d) if f.path.startswith("invoiceLines[0].total")]
        assert line_findings == [], "نفحذ قاعدة لم نُثبتها"

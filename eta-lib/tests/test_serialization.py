"""
اختبار التسلسل الكنسي ضد **العيّنة الرسمية** المنشورة على بوابة الهيئة.

المعيار هنا ليس رأينا ولا اجتهادنا: الهيئة تنشر مستنداً (`one-doc.json`)
والنصَّ الكنسي المتوقَّع منه (`one-doc-serialized.json.txt`). فإن طابقناه
بايتاً ببايت فنحن صحيحون، وإلا فنحن مخطئون — بلا مساحة تأويل.

المصدر: https://sdk.invoicing.eta.gov.eg/document-serialization-approach/
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from eta_invoice.serialization import (  # noqa: E402
    canonical_hash,
    load_document,
    serialize_document,
)

FIXTURES = ROOT / "fixtures"


@pytest.fixture(scope="module")
def official():
    doc_path = FIXTURES / "one-doc.json"
    exp_path = FIXTURES / "one-doc-serialized.json.txt"
    if not doc_path.exists() or not exp_path.exists():
        pytest.skip("العيّنة الرسمية غير موجودة — نزّلها من بوابة الهيئة")
    return (
        doc_path.read_text(encoding="utf-8-sig"),
        exp_path.read_text(encoding="utf-8-sig"),
    )


class TestOfficialSample:
    """المطابقة الحرفية للعيّنة الرسمية — لا شيء دونها كافٍ."""

    def test_matches_official_serialization_exactly(self, official):
        raw, expected = official
        got = serialize_document(load_document(raw))
        expected = expected.strip()

        if got != expected:
            # نُظهر أول موضع اختلاف بدل إغراق المخرَج بخمسة آلاف حرف
            i = next((k for k in range(min(len(got), len(expected)))
                      if got[k] != expected[k]), min(len(got), len(expected)))
            lo = max(0, i - 60)
            pytest.fail(
                f"اختلاف عند المحرف {i} (طولنا {len(got)}، المتوقَّع {len(expected)}):\n"
                f"  المتوقَّع: …{expected[lo:i + 60]!r}\n"
                f"  ناتجنا  : …{got[lo:i + 60]!r}"
            )

    def test_hash_is_stable_and_uppercase_hex(self, official):
        raw, expected = official
        h = canonical_hash(load_document(raw))
        assert len(h) == 64 and h == h.upper()
        # نفس الهاش يجب أن ينتج من النص الرسمي مباشرةً
        assert h == hashlib.sha256(expected.strip().encode("utf-8")).hexdigest().upper()


class TestSpecRules:
    """كل قاعدة في المواصفة مُختبَرة وحدها، فيُعرف أيّها انكسر."""

    def test_property_names_uppercased(self):
        assert serialize_document({"issuerName": "x"}) == '"ISSUERNAME""x"'

    def test_values_keep_their_literal_form(self):
        """القاعدة (3) — الفخّ الأشهر: 0.0 لا تصير 0 ولا 0.00."""
        doc = load_document('{"a": 0.0, "b": 0.00, "c": 0, "d": 1.500}')
        out = serialize_document(doc)
        assert '"A""0.0"' in out
        assert '"B""0.00"' in out
        assert '"C""0"' in out
        assert '"D""1.500"' in out

    def test_nested_objects_recurse(self):
        assert serialize_document({"a": {"b": "1"}}) == '"A""B""1"'

    def test_array_name_repeats_before_each_element(self):
        """القاعدة (5) — اسم المصفوفة مرة كبادئة، ثم قبل كل عنصر."""
        out = serialize_document({"items": [{"id": "1"}, {"id": "2"}]})
        assert out == '"ITEMS""ITEMS""ID""1""ITEMS""ID""2"'

    def test_empty_array_emits_only_its_name(self):
        assert serialize_document({"items": []}) == '"ITEMS"'

    def test_array_of_simple_values(self):
        assert serialize_document({"tags": ["a", "b"]}) == '"TAGS""TAGS""a""TAGS""b"'

    def test_bare_array_is_rejected(self):
        """المصفوفة لا معنى لها بلا اسمها — والصمت هنا يُنتج هاشاً خاطئاً."""
        with pytest.raises(ValueError):
            serialize_document([{"a": "1"}])

    def test_key_order_is_preserved(self):
        """ترتيب المفاتيح جزء من الهاش — إعادة ترتيبها تُنتج مستنداً آخر."""
        a = serialize_document(load_document('{"x":"1","y":"2"}'))
        b = serialize_document(load_document('{"y":"2","x":"1"}'))
        assert a != b

    def test_arabic_values_pass_through_unchanged(self):
        out = serialize_document({"name": "شركة النور"})
        assert out == '"NAME""شركة النور"'


class TestHashDiscrimination:
    """الهاش يجب أن يفرّق بين مستندات مختلفة — وإلا سقطت فائدة التوقيع."""

    @pytest.mark.parametrize("a,b", [
        ('{"total": "100.00"}', '{"total": "100.0"}'),
        ('{"total": "100"}',    '{"total": "1000"}'),
        ('{"a":"1","b":"2"}',   '{"b":"2","a":"1"}'),
        ('{"items":[{"id":"1"}]}', '{"items":[{"id":"1"},{"id":"1"}]}'),
    ])
    def test_different_documents_hash_differently(self, a, b):
        assert canonical_hash(load_document(a)) != canonical_hash(load_document(b))

    def test_whitespace_and_newlines_do_not_change_the_hash(self):
        """الغرض المُعلَن للخوارزمية: نقل الشبكة لا يغيّر التوقيع."""
        compact = '{"a":"1","b":{"c":"2"}}'
        spaced = '{\n  "a" : "1",\n  "b" : {\n     "c" : "2"\n  }\n}'
        assert canonical_hash(load_document(compact)) == canonical_hash(load_document(spaced))


class TestJsonWriterConsistency:
    """
    الهاش مبنيّ على الشكل النصّي للقيمة، فكاتب JSON مختلف = هاش مختلف =
    مستند مرفوض بلا تشخيص. هذه الاختبارات تحرس تلك الحلقة.
    """

    def test_dump_then_load_preserves_the_hash(self):
        from eta_invoice.serialization import dump_document
        doc = load_document('{"a": 114.0, "b": 0.10, "c": "نص", "d": [{"e": 1}]}')
        assert canonical_hash(load_document(dump_document(doc))) == canonical_hash(doc)

    def test_official_sample_survives_a_dump_load_cycle(self, official):
        from eta_invoice.serialization import dump_document
        raw, _ = official
        doc = load_document(raw)
        assert canonical_hash(load_document(dump_document(doc))) == canonical_hash(doc)

    def test_a_writer_that_drops_the_decimal_point_breaks_the_hash(self):
        """
        توثيق الخطر لا افتراضه: `114` و`114.0` مستندان مختلفان عند الهيئة.
        فمن كتب بأداة تُسقط الصفر العشري، رُفض مستنده — وهذا سبب وجود
        `dump_document`.
        """
        a = canonical_hash(load_document('{"total": 114.0}'))
        b = canonical_hash(load_document('{"total": 114}'))
        assert a != b

    def test_indentation_and_spacing_do_not_change_the_hash(self):
        from eta_invoice.serialization import dump_document
        doc = load_document('{"a":"1","b":{"c":"2"}}')
        assert canonical_hash(load_document(dump_document(doc, indent=4))) == canonical_hash(doc)


class TestPublicSurface:
    """السطح العام عقدٌ — ما فيه لا يُكسر بلا قصد، وما ليس فيه يجوز تغييره."""

    def test_package_exports_the_documented_api(self):
        import eta_invoice
        for name in ("load_document", "dump_document", "serialize_document",
                     "canonical_hash", "validate_document", "format_report",
                     "InvoiceBuilder", "InvoiceLine", "Party", "Address", "Tax"):
            assert hasattr(eta_invoice, name), f"{name} غائب عن السطح العام"
            assert name in eta_invoice.__all__

    def test_signing_is_not_exported_because_it_is_not_built(self):
        """لو ظهر توقيع في السطح العام يوماً فليكن مقصوداً ومُختبَراً."""
        import eta_invoice
        leaked = [n for n in eta_invoice.__all__ if "sign" in n.lower() or "submit" in n.lower()]
        assert leaked == [], f"تسرّب توقيع/إرسال غير مبنيّ: {leaked}"

    def test_version_is_declared(self):
        import eta_invoice
        assert eta_invoice.__version__.count(".") == 2

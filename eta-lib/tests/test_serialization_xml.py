"""
اختبار التسلسل الكنسي لصيغة XML ضد العيّنة الرسمية.

خوارزمية XML **ليست** خوارزمية JSON، ومن خلط بينهما حصل على هاش خاطئ
ورُفض مستنده. لذلك تُختبر الفروق الثلاثة صراحةً: إدراج اسم الجذر، وغياب
المعالجة الخاصة للمصفوفات، وتهريب الاقتباس.
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from eta_invoice.serialization_xml import (  # noqa: E402
    canonical_hash_xml,
    escape_quotes,
    load_xml_document,
    serialize_xml_document,
)

FIXTURES = ROOT / "fixtures"


@pytest.fixture(scope="module")
def official():
    doc, exp = FIXTURES / "one-doc.xml", FIXTURES / "one-doc-serialized.xml.txt"
    if not doc.exists() or not exp.exists():
        pytest.skip("عيّنة XML الرسمية غير موجودة")
    return doc.read_text(encoding="utf-8-sig"), exp.read_text(encoding="utf-8-sig")


class TestOfficialSample:
    def test_matches_official_xml_serialization_exactly(self, official):
        raw, expected = official
        got = serialize_xml_document(load_xml_document(raw))
        expected = expected.strip()
        if got != expected:
            i = next((k for k in range(min(len(got), len(expected)))
                      if got[k] != expected[k]), min(len(got), len(expected)))
            pytest.fail(
                f"اختلاف عند {i} (طولنا {len(got)}، المتوقَّع {len(expected)}):\n"
                f"  المتوقَّع: …{expected[max(0, i-60):i+60]!r}\n"
                f"  ناتجنا  : …{got[max(0, i-60):i+60]!r}"
            )

    def test_hash_is_uppercase_hex(self, official):
        raw, _ = official
        h = canonical_hash_xml(load_xml_document(raw))
        assert len(h) == 64 and h == h.upper()


class TestXmlSpecificRules:
    """الفروق الثلاثة عن JSON — كلٌّ مُختبَر وحده."""

    def test_root_element_name_is_included(self):
        """بخلاف JSON، اسم الجذر جزء من الناتج."""
        out = serialize_xml_document(ET.fromstring("<document><a>1</a></document>"))
        assert out.startswith('"DOCUMENT"')
        assert out == '"DOCUMENT""A""1"'

    def test_repeated_elements_carry_their_own_names(self):
        """لا بادئة مصفوفة ولا تكرار للاسم — كل وسم يحمل اسمه."""
        out = serialize_xml_document(
            ET.fromstring("<doc><items><item><id>1</id></item>"
                          "<item><id>2</id></item></items></doc>"))
        assert out == '"DOC""ITEMS""ITEM""ID""1""ITEM""ID""2"'

    def test_quotes_are_escaped(self):
        out = serialize_xml_document(ET.fromstring('<doc><n>say "hi"</n></doc>'))
        assert out == '"DOC""N""say \\"hi\\""'

    def test_escape_helper(self):
        assert escape_quotes('a"b') == 'a\\"b'
        assert escape_quotes("بلا اقتباس") == "بلا اقتباس"

    def test_empty_element_serializes_as_empty_value(self):
        assert serialize_xml_document(ET.fromstring("<doc><n/></doc>")) == '"DOC""N"""'

    def test_namespaces_are_stripped(self):
        out = serialize_xml_document(
            ET.fromstring('<doc xmlns="urn:x"><name>س</name></doc>'))
        assert out == '"DOC""NAME""س"'

    def test_arabic_text_passes_through(self):
        out = serialize_xml_document(ET.fromstring("<doc><n>الشركة المصدرة</n></doc>"))
        assert out == '"DOC""N""الشركة المصدرة"'


class TestXmlDiffersFromJson:
    """
    الخلط بين الخوارزميتين هو الخطأ الذي يُنتج هاشاً صالحاً شكلاً وخاطئاً
    فعلاً — فيُرفض المستند بلا تشخيص.
    """

    def test_same_data_hashes_differently_in_the_two_formats(self):
        from eta_invoice.serialization import canonical_hash, load_document
        xml_h = canonical_hash_xml(ET.fromstring("<document><a>1</a></document>"))
        json_h = canonical_hash(load_document('{"a": "1"}'))
        assert xml_h != json_h, "الصيغتان تعطيان الهاش نفسه — إحدى الخوارزميتين خاطئة"

    def test_quote_escaping_prevents_collision(self):
        """بلا تهريب، مستندان مختلفان قد يعطيان الناتج نفسه."""
        a = serialize_xml_document(ET.fromstring('<d><x>a"</x><y>b</y></d>'))
        b = serialize_xml_document(ET.fromstring('<d><x>a</x><y>"b</y></d>'))
        assert a != b


class TestHashDiscrimination:
    @pytest.mark.parametrize("a,b", [
        ("<d><t>100.00</t></d>", "<d><t>100.0</t></d>"),
        ("<d><a>1</a><b>2</b></d>", "<d><b>2</b><a>1</a></d>"),
        ("<d><i>1</i></d>", "<d><i>1</i><i>1</i></d>"),
    ])
    def test_different_documents_hash_differently(self, a, b):
        assert canonical_hash_xml(ET.fromstring(a)) != canonical_hash_xml(ET.fromstring(b))

    def test_formatting_does_not_change_the_hash(self):
        compact = "<d><a>1</a><b><c>2</c></b></d>"
        spaced = "<d>\n  <a>1</a>\n  <b>\n    <c>2</c>\n  </b>\n</d>"
        assert canonical_hash_xml(ET.fromstring(compact)) == canonical_hash_xml(ET.fromstring(spaced))


class TestWhitespaceTrap:
    """
    فخّ يستحق التوثيق: المسافات **بين** الوسوم لا أثر لها، والمسافات
    **داخل** ورقة لها أثر — لأن المواصفة تأخذ القيمة «بلا أي معالجة».

    فمن نسّق مستنده بأداة تُضيف مسافات داخل الوسوم الورقية، تغيّر هاشه
    ورُفض مستنده. وهذا سلوكٌ صحيح لا عيب — لكنه يجب أن يُعرف.
    """

    def test_whitespace_inside_a_leaf_is_significant(self):
        tight = serialize_xml_document(ET.fromstring("<d><a>1</a></d>"))
        padded = serialize_xml_document(ET.fromstring("<d><a> 1 </a></d>"))
        assert tight == '"D""A""1"'
        assert padded == '"D""A"" 1 "'
        assert tight != padded

    def test_pretty_printed_leaf_changes_the_hash(self):
        inline = canonical_hash_xml(ET.fromstring("<d><a>1</a></d>"))
        pretty = canonical_hash_xml(ET.fromstring("<d><a>\n    1\n  </a></d>"))
        assert inline != pretty, "المسافات داخل الورقة يجب أن تُغيّر الهاش"

    def test_whitespace_between_tags_is_ignored(self):
        a = canonical_hash_xml(ET.fromstring("<d><a>1</a><b>2</b></d>"))
        b = canonical_hash_xml(ET.fromstring("<d>\n  <a>1</a>\n  <b>2</b>\n</d>"))
        assert a == b

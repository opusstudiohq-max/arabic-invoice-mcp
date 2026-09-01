"""
التسلسل الكنسي لمستندات منظومة الفاتورة الإلكترونية المصرية (ETA).

هذه أصعب قطعة في التكامل كله، وموضع الفشل الأشيع: المرجع الرسمي
`EInvoicingSigner` مهجور منذ يناير 2024 بـ26 مشكلة مفتوحة و63 نسخة مشتقة،
ولا توجد حزمة npm واحدة للمنظومة.

**المواصفة** (مقتبسة من https://sdk.invoicing.eta.gov.eg/document-serialization-approach/):

1. تُعالَج المستندات **تعاوداً** بدءاً من جذر المستند.
2. تُحوَّل كل أسماء الخصائص إلى **حروف كبيرة** بتحويل مستقل عن اللغة.
3. تُؤخذ القيم **كما هي في المستند الأصلي بلا أي معالجة** — فإن كانت
   `0.0` تبقى `0.0`، ولا تصير `0` ولا `0.00`.
4. تُحاط أسماء الخصائص والقيم البسيطة بعلامتَي اقتباس مزدوجتين.
5. في JSON: يُسبَق ناتجُ المصفوفة كلِّه باسمها، **ويُسبَق كل عنصر فيها
   باسم المصفوفة أيضاً** — وهذا موضع الاختلاف عن XML.

### القاعدة (3) هي الفخّ

`json.loads` العادي يحوّل `0.0` إلى `float` فيضيع شكلها اللفظي، ثم تُعاد
كتابتها فيختلف الهاش عن هاش الهيئة — ويُرفض المستند بلا تشخيص مفيد.
الحل هنا: `parse_float=str` و`parse_int=str`، فتبقى القيمة **نصّاً كما
كُتبت حرفياً في الملف**.

### التحقق

`tests/test_serialization.py` يقارن مخرَج هذه الوحدة بالملف الرسمي
`one-doc-serialized.json.txt` المنشور على بوابة الهيئة — بايتاً ببايت.
"""
from __future__ import annotations

import json
from typing import Any

__all__ = ["serialize_document", "load_document", "canonical_hash", "dump_document"]


def load_document(text: str) -> Any:
    """
    قراءة مستند JSON **مع حفظ الشكل اللفظي للأرقام**.

    نحفظ `0.0` و`0.00` و`1e3` كما كُتبت، لأن المواصفة تُلزم بأخذ القيمة
    «بلا أي معالجة». وترتيب المفاتيح محفوظ لأن قواميس بايثون مرتّبة.
    """
    return json.loads(text, parse_float=str, parse_int=str)


def _is_simple(value: Any) -> bool:
    """قيمة بسيطة = ليست كائناً ولا مصفوفة."""
    return not isinstance(value, (dict, list))


def _simple_to_text(value: Any) -> str:
    """
    تحويل قيمة بسيطة إلى نصّها كما ورد في المستند.

    الأرقام تصل نصّاً أصلاً (بفضل `load_document`). ويبقى التعامل مع
    القيم المنطقية والعدم — والمواصفة لا تنصّ عليها صراحةً، فنستعمل
    تمثيل JSON الحرفي (`true`/`false`/`null`) وهو أقرب ما يكون لـ«القيمة
    كما هي في المستند».
    """
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    return str(value)


def serialize_document(node: Any) -> str:
    """
    التسلسل الكنسي لمستند واحد (لا لمصفوفة المستندات كلها).

    ⚠️ **الجذر ليس جذر الإرسال.** المواصفة تنبّه: جذر المستند هو الكائن
    الذي يضمّ خصائص المستند، لا مصفوفة `documents`. فمرّر مستنداً واحداً.

    Args:
        node: المستند بعد `load_document` (وبلا حقل التوقيعات).

    Returns:
        النص الكنسي الجاهز للتجزئة بـSHA-256 بترميز UTF-8.
    """
    if _is_simple(node):
        return f'"{_simple_to_text(node)}"'

    if isinstance(node, list):
        # المصفوفة لا تُسلسَل وحدها — تُسلسَل دائماً باسمها من الكائن الحاوي
        raise ValueError("لا تُسلسَل مصفوفة إلا من داخل كائن يحمل اسمها")

    out: list[str] = []
    for name, value in node.items():
        key = f'"{name.upper()}"'
        if isinstance(value, list):
            out.append(key)                       # بادئة المصفوفة كلها
            for element in value:
                out.append(key)                   # ثم اسم المصفوفة قبل كل عنصر
                out.append(serialize_document(element))
        else:
            out.append(key)
            out.append(serialize_document(value))
    return "".join(out)


def canonical_hash(document: Any) -> str:
    """
    تجزئة SHA-256 للنص الكنسي، بترميز UTF-8، بصيغة hex بحروف كبيرة.

    وهي القيمة التي تُوقَّع، وتُستعمل أيضاً كـ«معرّف المستند الفريد» (UUID)
    في منظومة الهيئة.
    """
    import hashlib

    canonical = serialize_document(document)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest().upper()


def dump_document(document: Any, *, indent: int | None = None) -> str:
    """
    كتابة المستند بصيغة JSON **متطابقة مع ما يُجزَّأ منه**.

    ⚠️ لماذا لا يُترك هذا لأي كاتب JSON: الهاش مبنيّ على **الشكل النصّي**
    للقيمة. فإن كتب كاتبٌ `114` حيث نجزّئ `114.0` — وكلاهما JSON صحيح —
    اختلف الهاش عن هاش الهيئة و**رُفض المستند بلا تشخيص**.

    فمن بنى مستنداً بهذه المكتبة فليكتبه بهذه الدالة، أو فليضمن أن كاتبه
    يُخرج الأرقام بنفس تمثيل بايثون النصّي.
    """
    import json

    return json.dumps(document, ensure_ascii=False, indent=indent, allow_nan=False)

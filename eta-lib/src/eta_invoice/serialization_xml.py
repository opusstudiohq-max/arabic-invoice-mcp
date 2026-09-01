"""
التسلسل الكنسي لمستندات ETA بصيغة **XML**.

كثير من أنظمة ERP ترسل XML لا JSON، والمواصفة تعرّف لهما خوارزميتين
**مختلفتين** — ومن طبّق خوارزمية JSON على XML حصل على هاش خاطئ ورُفض
مستنده.

### الفروق الثلاثة عن JSON

| | JSON | XML |
|---|---|---|
| جذر المستند | **لا يُدرَج** اسمه | **يُدرَج** — يبدأ الناتج بـ`"DOCUMENT"` |
| المصفوفات | اسم المصفوفة يُكرَّر قبل كل عنصر | **لا معالجة خاصة** — كل عنصر يحمل اسمه من الوسم |
| الاقتباس | لا تهريب | `"` تُستبدل بـ`\\"` |

**والتهريب ليس تجميلاً:** المواصفة تنصّ أنه «لمنع المستخدمين من إنشاء
مستندات مختلفة بنفس ناتج التسلسل» — أي أنه حمايةٌ من تصادم الهاش.

### المواصفة (شيفرة الهيئة الوصفية)

```
function Serialize(documentStructure)
    if simple value: return '"' + EscapeQuotes(value) + '"'
    foreach element:
        append '"' + element.name.uppercase + '"'
        append Serialize(element.value)
```

### التحقق

`tests/test_serialization_xml.py` يقارن المخرَج بالملف الرسمي
`one-doc-serialized.xml.txt` — بايتاً ببايت.
"""
from __future__ import annotations

import hashlib
import xml.etree.ElementTree as ET

__all__ = [
    "serialize_xml_document",
    "canonical_hash_xml",
    "load_xml_document",
    "escape_quotes",
]


def escape_quotes(value: str) -> str:
    """`"` ⇒ `\\"` — حمايةٌ من تصادم الهاش لا تجميل."""
    return value.replace('"', '\\"')


def load_xml_document(text: str) -> ET.Element:
    """قراءة المستند وإرجاع عنصره الجذر."""
    return ET.fromstring(text.lstrip("﻿"))


def _local_name(tag: str) -> str:
    """إسقاط نطاق الأسماء إن وُجد: `{ns}name` ⇒ `name`."""
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _serialize_element(element: ET.Element) -> str:
    """`"NAME"` ثم محتواه — قيمةً إن كان ورقة، أو أبناءه إن كان حاوياً."""
    name = f'"{_local_name(element.tag).upper()}"'
    children = list(element)
    if children:
        return name + "".join(_serialize_element(child) for child in children)
    text = element.text or ""
    return name + f'"{escape_quotes(text)}"'


def serialize_xml_document(root: ET.Element) -> str:
    """
    التسلسل الكنسي لمستند XML واحد.

    ⚠️ **يُمرَّر عنصر `<document>` نفسه** — لا عنصر `<documents>` الحاوي.
    والناتج يبدأ باسم الجذر (`"DOCUMENT"`) بخلاف نسخة JSON.
    """
    return _serialize_element(root)


def canonical_hash_xml(root: ET.Element) -> str:
    """SHA-256 للنص الكنسي بترميز UTF-8، hex بحروف كبيرة."""
    return hashlib.sha256(
        serialize_xml_document(root).encode("utf-8")
    ).hexdigest().upper()

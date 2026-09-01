"""
مكتبة الفاتورة الإلكترونية المصرية (ETA).

السطح العام معرَّف هنا صراحةً — فما لم يُذكر في `__all__` تفصيلٌ داخلي
يجوز أن يتغيّر.

    from eta_invoice import InvoiceBuilder, canonical_hash, validate_document

**ما ليس هنا عمداً:** التوقيع `CAdES-BES` والإرسال. الهيئة لا تمنح حساب
بيئة تجريبية لمطوّر مستقل، والختم لا يرتبط إلا بكيان قانوني — ولن نشحن
كوداً لم يُشغَّل على المنظومة الحقيقية.
"""
from .builder import (
    Address,
    BuildError,
    InvoiceBuilder,
    InvoiceLine,
    Party,
    Tax,
)
from .serialization import (
    canonical_hash,
    dump_document,
    load_document,
    serialize_document,
)
from .serialization_xml import (
    canonical_hash_xml,
    escape_quotes,
    load_xml_document,
    serialize_xml_document,
)
from .validation import (
    UNRESOLVED,
    Finding,
    format_report,
    validate_document,
)

__version__ = "0.1.0"

__all__ = [
    # التسلسل والتجزئة
    "load_document",
    "dump_document",
    "serialize_document",
    "canonical_hash",
    # التسلسل والتجزئة — XML (خوارزمية مختلفة عن JSON)
    "load_xml_document",
    "serialize_xml_document",
    "canonical_hash_xml",
    "escape_quotes",
    # التحقق
    "validate_document",
    "format_report",
    "Finding",
    "UNRESOLVED",
    # البناء
    "InvoiceBuilder",
    "InvoiceLine",
    "Party",
    "Address",
    "Tax",
    "BuildError",
    "__version__",
]

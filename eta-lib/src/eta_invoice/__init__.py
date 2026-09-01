"""
مكتبة الفاتورة الإلكترونية المصرية (ETA).

السطح العام معرَّف هنا صراحةً — فما لم يُذكر في `__all__` تفصيلٌ داخلي
يجوز أن يتغيّر.

    from eta_invoice import InvoiceBuilder, canonical_hash, validate_document

**التوقيع `CAdES-BES` موجود** ومطابقٌ لنصّ مواصفة ITIDA، ومُتحقَّقٌ من كل
حقلٍ فيه بالتفكيك. **ولم يُشغَّل على وحدة تحقّق الهيئة** ولا على شهادة ختمٍ
حقيقية — فتلك تلزمها بطاقة ممول. ولا يُدَّعى قبولٌ لم يُرَ.

**وما ليس هنا:** الإرسال إلى المنظومة. لا يُبنى قبل قراءة شروط البوابة من
داخل حسابٍ مسجَّل.
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
from .signing import (
    ID_DIGESTED_DATA,
    CadesReport,
    SignerLike,
    build_cades_bes,
    build_signed_attributes,
    inspect_cades_bes,
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
    # التوقيع — CAdES-BES، مطابقٌ للمواصفة ولم يُشغَّل على وحدة تحقّق ITIDA بعد
    "build_cades_bes",
    "build_signed_attributes",
    "inspect_cades_bes",
    "SignerLike",
    "CadesReport",
    "ID_DIGESTED_DATA",
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

"""
توقيع CAdES-BES لمستندات منظومة الفاتورة الإلكترونية المصرية.

### المصدر

منقولٌ عن **نصّ المواصفة الرسمية**، لا عن مثالٍ ولا عن مكتبة:

    ITIDA — E-Signature Competence Center،
    *Digital Signature Format for E-Invoice System — Signature Creation Guide*،
    الإصدار 1.1، 10 نوفمبر 2020. ستّ صفحات، نُزِّلت واستُخرج نصّها.
    https://www.eta.gov.eg/sites/default/files/2021-09/Digital%20Signature%20Format%20V1.1_final_0.pdf

### ⚠️ الفخّ الذي يُسقط كل من استعمل مكتبة CMS بإعداداتها

`encapContentInfo.eContentType` **ليس** `id-data` المعتاد
(`1.2.840.113549.1.7.1`) بل **`id-digestedData`** (`1.2.840.113549.1.7.5`).
وكذلك سمة `content-type` الموقَّعة.

وكل مكتبة CMS تختار `id-data` تلقائياً. فمن وقّع بإعداداتها أنتج توقيعاً
**صحيحاً تشفيرياً** ترفضه وحدةُ تحقّق ITIDA — وهو أسوأ إخفاق ممكن: صحيحٌ
في كل فحصٍ عام، مرفوضٌ في الفحص الوحيد الذي يهمّ.

### البنية كما تفرضها المواصفة (§5، الجدول)

    SignedData.version              = 3
    digestAlgorithms                = { sha256 }
    encapContentInfo.eContentType   = id-digestedData
    encapContentInfo.eContent       = غائب  ← توقيع منفصل
    certificates                    = شهادة المُوقِّع **وحدها**
    signerInfos                     = عنصرٌ واحد لا غير
      · version                     = 1
      · sid                         = IssuerAndSerialNumber
      · digestAlgorithm             = sha256
      · signedAttrs                 = **أربع** سمات لا غير:
          content-type              = id-digestedData
          message-digest            = SHA-256 للنصّ الكنسي
          ESS-signing-certificate-v2= SHA-256 لشهادة المُوقِّع
          signing-time              = وقت الآلة بتوقيت UTC
      · unsignedAttrs               = **ممنوعة** («may NOT contain»)

### ما يُوقَّع

النصّ الكنسي من `serialization.py` (أو `serialization_xml.py`)، مُرمَّزاً
UTF-8. وهو مُطابَقٌ للعيّنة الرسمية بايتاً ببايت.

### 🔴 حدُّ ما نضمنه

هذا الملف **مطابقٌ للمواصفة المنشورة، ومُتحقَّقٌ من كل حقلٍ فيه بالتفكيك**.
ولم يُشغَّل بعدُ على **وحدة تحقّق ITIDA** ولا على شهادة ختمٍ حقيقية — فتلك
تلزمها بطاقة ممول وشهادة صادرة. ولا نزعم قبولاً لم نره.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from asn1crypto import algos, cms, core, tsp, x509

__all__ = [
    "ID_DIGESTED_DATA",
    "SHA256_OID",
    "build_signed_attributes",
    "build_cades_bes",
    "inspect_cades_bes",
    "SignerLike",
    "CadesReport",
]

#: نوع المحتوى الذي تفرضه المواصفة — لا `id-data`.
ID_DIGESTED_DATA = "1.2.840.113549.1.7.5"

#: خوارزمية التجزئة الوحيدة المدعومة في نطاق المواصفة.
SHA256_OID = "2.16.840.1.101.3.4.2.1"


class SignerLike:
    """
    ما نحتاجه من المُوقِّع، لا أكثر.

    الفصل مقصود: التوقيع الفعلي يقع في الرمز الذاكري (HSM/توكن) أو في
    مكتبة تشفير، ولا يمرّ مفتاحٌ خاص من هنا. فيكفينا شهادةٌ ودالّةُ توقيع.
    """

    def __init__(self, certificate_der: bytes, sign: "callable[[bytes], bytes]"):
        self.certificate_der = certificate_der
        self._sign = sign
        self.certificate = x509.Certificate.load(certificate_der)

    def sign(self, data: bytes) -> bytes:
        """توقيع RSA بـSHA-256 على `data`، ويُعاد خاماً (PKCS#1 v1.5)."""
        return self._sign(data)


def _ess_signing_certificate_v2(certificate_der: bytes) -> "tsp.SetOfSigningCertificatesV2":
    """
    `ESSSigningCertificateV2` — تجزئة SHA-256 لشهادة المُوقِّع.

    والمواصفة تنصّ: `certHash` إلزامي، و`issuerSerial` اختياري. فلا يُدرج
    الاختياري: كل بايتٍ زائد سطحُ اختلافٍ محتمل مع وحدة التحقّق، ولا فائدة
    منه إذ الشهادة نفسها مُضمَّنة.
    """
    cert_hash = hashlib.sha256(certificate_der).digest()
    # الأصناف في `asn1crypto.tsp` لا `cms` — والاسم يُضلّل، فالبنية من RFC 5035
    return tsp.SetOfSigningCertificatesV2([
        tsp.SigningCertificateV2({
            "certs": [tsp.ESSCertIDv2({"cert_hash": cert_hash})],
        })
    ])


def build_signed_attributes(
    canonical: bytes,
    certificate_der: bytes,
    signing_time: datetime | None = None,
) -> cms.CMSAttributes:
    """
    السمات الموقَّعة الأربع — بهذا الترتيب وبلا خامسة.

    ⚠️ `signing_time` يجب أن يكون بتوقيت UTC. ومن مرّر وقتاً محلياً بلا
    منطقة زمنية أنتج توقيعاً بوقتٍ خاطئ لا يُكتشف إلا عند التحكيم.
    """
    if signing_time is None:
        signing_time = datetime.now(timezone.utc)
    if signing_time.tzinfo is None:
        raise ValueError("وقت التوقيع يجب أن يحمل منطقة زمنية — والمواصفة تفرض UTC")
    signing_time = signing_time.astimezone(timezone.utc).replace(microsecond=0)

    return cms.CMSAttributes([
        cms.CMSAttribute({
            "type": "content_type",
            "values": [cms.ContentType(ID_DIGESTED_DATA)],
        }),
        cms.CMSAttribute({
            "type": "message_digest",
            "values": [core.OctetString(hashlib.sha256(canonical).digest())],
        }),
        cms.CMSAttribute({
            "type": "signing_time",
            "values": [cms.Time({"utc_time": signing_time})],
        }),
        cms.CMSAttribute({
            "type": "signing_certificate_v2",
            "values": _ess_signing_certificate_v2(certificate_der),
        }),
    ])


def build_cades_bes(
    canonical: bytes,
    signer: SignerLike,
    signing_time: datetime | None = None,
) -> bytes:
    """
    يبني توقيع CAdES-BES منفصلاً على النصّ الكنسي، ويُعيده DER.

    :param canonical: النصّ الكنسي مُرمَّزاً UTF-8 — من `serialize_document`
    :param signer: شهادةٌ ودالّةُ توقيع؛ لا يمرّ مفتاحٌ خاص من هنا
    :param signing_time: بتوقيت UTC؛ المبدئي وقت الآلة الآن
    """
    signed_attrs = build_signed_attributes(canonical, signer.certificate_der, signing_time)

    # يُوقَّع الترميز DER للسمات بوسمِ SET صريح — نصُّ RFC 5652 §5.4.
    # وهذا موضعٌ يخطئ فيه من يوقّع البايتات كما وردت في الرسالة (وسم [0]).
    signature = signer.sign(signed_attrs.dump())

    certificate = signer.certificate
    signer_info = cms.SignerInfo({
        "version": "v1",
        "sid": cms.SignerIdentifier({
            "issuer_and_serial_number": cms.IssuerAndSerialNumber({
                "issuer": certificate.issuer,
                "serial_number": certificate.serial_number,
            })
        }),
        "digest_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
        "signed_attrs": signed_attrs,
        "signature_algorithm": algos.SignedDigestAlgorithm({"algorithm": "rsassa_pkcs1v15"}),
        "signature": signature,
        # لا `unsigned_attrs`: المواصفة تنصّ أنها **ممنوعة**.
    })

    signed_data = cms.SignedData({
        "version": "v3",
        "digest_algorithms": [algos.DigestAlgorithm({"algorithm": "sha256"})],
        "encap_content_info": {
            "content_type": ID_DIGESTED_DATA,
            # لا `content`: التوقيع منفصل، والمواصفة تنصّ «should not be present».
        },
        "certificates": [certificate],      # شهادة المُوقِّع وحدها
        "signer_infos": [signer_info],      # عنصرٌ واحد لا غير
    })

    return cms.ContentInfo({
        "content_type": "signed_data",
        "content": signed_data,
    }).dump()


class CadesReport:
    """نتيجة تفكيك توقيعٍ وفحصه حقلاً حقلاً أمام جدول المواصفة."""

    def __init__(self, problems: list[str], details: dict[str, object]):
        self.problems = problems
        self.details = details

    @property
    def conformant(self) -> bool:
        return not self.problems

    def __repr__(self) -> str:
        state = "مطابق" if self.conformant else f"{len(self.problems)} مخالفة"
        return f"<CadesReport {state}>"


def inspect_cades_bes(signature_der: bytes, canonical: bytes | None = None) -> CadesReport:
    """
    يفكّ توقيعاً ويقارنه بجدول المواصفة، حقلاً حقلاً.

    يفيد في فحص توقيعات الغير، وفي إثبات أن ما نبنيه نحن مطابق — **ولا
    يُثبت قبول وحدة تحقّق ITIDA**، فذاك حدثٌ في نظامها لا في الملف.
    """
    problems: list[str] = []
    details: dict[str, object] = {}

    info = cms.ContentInfo.load(signature_der)
    if info["content_type"].native != "signed_data":
        problems.append(f"نوع المحتوى الخارجي «{info['content_type'].native}» لا signed_data")
        return CadesReport(problems, details)

    signed = info["content"]
    details["version"] = signed["version"].native
    if signed["version"].native != "v3":
        problems.append(f"SignedData.version = {signed['version'].native} والمواصفة تفرض 3")

    digests = [d["algorithm"].native for d in signed["digest_algorithms"]]
    details["digest_algorithms"] = digests
    if digests != ["sha256"]:
        problems.append(f"digestAlgorithms = {digests} والمواصفة تفرض sha256 وحدها")

    encap = signed["encap_content_info"]
    content_type = encap["content_type"].dotted
    details["encap_content_type"] = content_type
    if content_type != ID_DIGESTED_DATA:
        problems.append(
            f"eContentType = {content_type} والمواصفة تفرض {ID_DIGESTED_DATA} "
            "(id-digestedData) — وهذا الفخّ الذي تقع فيه المكتبات بإعداداتها"
        )
    if encap["content"].native is not None:
        problems.append("eContent موجود، والمواصفة تفرض توقيعاً منفصلاً بلا محتوى")

    certificates = signed["certificates"]
    details["certificate_count"] = len(certificates) if certificates else 0
    if not certificates or len(certificates) != 1:
        problems.append(f"عدد الشهادات {details['certificate_count']} والمواصفة تفرض شهادة المُوقِّع وحدها")

    signers = signed["signer_infos"]
    details["signer_count"] = len(signers)
    if len(signers) != 1:
        problems.append(f"عدد SignerInfo = {len(signers)} والمواصفة تفرض واحداً")
        return CadesReport(problems, details)

    signer = signers[0]
    if signer["version"].native != "v1":
        problems.append(f"SignerInfo.version = {signer['version'].native} والمواصفة تفرض 1")
    if signer["sid"].name != "issuer_and_serial_number":
        problems.append(f"sid = {signer['sid'].name} والمواصفة تفرض IssuerAndSerialNumber")
    if signer["digest_algorithm"]["algorithm"].native != "sha256":
        problems.append("digestAlgorithm في SignerInfo ليس sha256")

    if signer["unsigned_attrs"].native is not None:
        problems.append("توجد سمات غير موقَّعة، والمواصفة تنصّ أنها ممنوعة")

    attrs = signer["signed_attrs"]
    if attrs.native is None:
        problems.append("لا سمات موقَّعة")
        return CadesReport(problems, details)

    present = [a["type"].native for a in attrs]
    details["signed_attributes"] = present
    required = {"content_type", "message_digest", "signing_time", "signing_certificate_v2"}
    missing = required - set(present)
    if missing:
        problems.append(f"سمات موقَّعة ناقصة: {sorted(missing)}")
    extra = set(present) - required
    if extra:
        problems.append(f"سمات موقَّعة زائدة على الأربع: {sorted(extra)}")

    by_type = {a["type"].native: a["values"] for a in attrs}
    if "content_type" in by_type:
        value = by_type["content_type"][0].dotted
        details["attr_content_type"] = value
        if value != ID_DIGESTED_DATA:
            problems.append(f"سمة content-type = {value} والمواصفة تفرض {ID_DIGESTED_DATA}")

    if canonical is not None and "message_digest" in by_type:
        expected = hashlib.sha256(canonical).digest()
        actual = by_type["message_digest"][0].native
        details["message_digest_matches"] = actual == expected
        if actual != expected:
            problems.append("message-digest لا يطابق تجزئة النصّ الكنسي المُمرَّر")

    if "signing_time" in by_type:
        moment = by_type["signing_time"][0].native
        details["signing_time"] = moment
        if moment.tzinfo is None or moment.utcoffset().total_seconds() != 0:
            problems.append("signing-time ليس بتوقيت UTC")

    if "signing_certificate_v2" in by_type and certificates and len(certificates) == 1:
        declared = by_type["signing_certificate_v2"][0]["certs"][0]["cert_hash"].native
        actual = hashlib.sha256(certificates[0].dump()).digest()
        details["certificate_hash_matches"] = declared == actual
        if declared != actual:
            problems.append("ESSSigningCertificateV2 لا يطابق تجزئة الشهادة المُضمَّنة")

    return CadesReport(problems, details)

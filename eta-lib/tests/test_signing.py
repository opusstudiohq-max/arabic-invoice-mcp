"""
اختبار توقيع CAdES-BES ضد **جدول المواصفة**، حقلاً حقلاً.

### ما تُثبته هذه الاختبارات

أن ما نبنيه مطابقٌ للبنية التي تنصّ عليها وثيقة ITIDA، وأن التوقيع صحيحٌ
تشفيرياً على السمات الموقَّعة.

### وما لا تُثبته

**أن وحدة تحقّق ITIDA تقبله.** ذاك حدثٌ في نظامها، ويلزمه ختمٌ حقيقي
وحسابُ ممول. ولن يُدَّعى قبولٌ لم يُرَ.

### والاختبار الأهم هنا سالب

نبني توقيعاً بإعدادات المكتبة الافتراضية (`id-data`) ونُثبت أن الفاحص
**يرفضه**. فلو مرّ لكان الفاحص زينةً، وكان التوقيع الصحيح تشفيرياً
والمرفوض عند الهيئة يمرّ عندنا بعلامة خضراء.
"""
from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

asn1crypto = pytest.importorskip("asn1crypto", reason="asn1crypto غير مثبَّتة")
cryptography = pytest.importorskip("cryptography", reason="cryptography غير مثبَّتة")

from asn1crypto import algos, cms, core, tsp  # noqa: E402
from cryptography import x509 as cx  # noqa: E402
from cryptography.exceptions import InvalidSignature  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import padding, rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

from eta_invoice.signing import (  # noqa: E402
    ID_DIGESTED_DATA,
    SignerLike,
    build_cades_bes,
    build_signed_attributes,
    inspect_cades_bes,
)
from eta_invoice.serialization import canonical_hash, load_document, serialize_document  # noqa: E402

CANONICAL = '"DOCUMENT""TOTALAMOUNT""1150.00"'.encode("utf-8")
WHEN = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def keypair():
    """شهادة اختبار موقَّعة ذاتياً — لا تُغني عن ختمٍ حقيقي، وتكفي للبنية."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = cx.Name([
        cx.NameAttribute(NameOID.COMMON_NAME, "Opus Studio Test Seal"),
        cx.NameAttribute(NameOID.COUNTRY_NAME, "EG"),
    ])
    certificate = (
        cx.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(cx.random_serial_number())
        .not_valid_before(datetime(2026, 1, 1, tzinfo=timezone.utc))
        .not_valid_after(datetime(2028, 1, 1, tzinfo=timezone.utc))
        .sign(key, hashes.SHA256())
    )
    return key, certificate.public_bytes(serialization.Encoding.DER)


@pytest.fixture(scope="module")
def signer(keypair):
    key, der = keypair
    return SignerLike(der, lambda data: key.sign(data, padding.PKCS1v15(), hashes.SHA256()))


@pytest.fixture(scope="module")
def signature(signer):
    return build_cades_bes(CANONICAL, signer, WHEN)


class TestSpecificationTable:
    """كل صفٍّ في جدول §5 من الوثيقة، مُختبَراً وحده."""

    def test_outer_content_type_is_signed_data(self, signature):
        assert cms.ContentInfo.load(signature)["content_type"].native == "signed_data"

    def test_signed_data_version_is_three(self, signature):
        signed = cms.ContentInfo.load(signature)["content"]
        assert signed["version"].native == "v3"

    def test_digest_algorithm_is_sha256_only(self, signature):
        signed = cms.ContentInfo.load(signature)["content"]
        assert [d["algorithm"].native for d in signed["digest_algorithms"]] == ["sha256"]

    def test_encap_content_type_is_digested_data_not_data(self, signature):
        """
        الفخّ الأول: `id-digestedData` لا `id-data`.

        كل مكتبة CMS تختار `id-data` تلقائياً، فيخرج توقيعٌ صحيح تشفيرياً
        ترفضه وحدة التحقّق — أسوأ إخفاق ممكن.
        """
        signed = cms.ContentInfo.load(signature)["content"]
        assert signed["encap_content_info"]["content_type"].dotted == ID_DIGESTED_DATA
        assert signed["encap_content_info"]["content_type"].dotted != "1.2.840.113549.1.7.1"

    def test_signature_is_detached(self, signature):
        signed = cms.ContentInfo.load(signature)["content"]
        assert signed["encap_content_info"]["content"].native is None

    def test_only_the_signer_certificate_is_embedded(self, signature, keypair):
        signed = cms.ContentInfo.load(signature)["content"]
        assert len(signed["certificates"]) == 1
        assert signed["certificates"][0].dump() == keypair[1]

    def test_exactly_one_signer_info(self, signature):
        signed = cms.ContentInfo.load(signature)["content"]
        assert len(signed["signer_infos"]) == 1

    def test_signer_info_version_and_identifier(self, signature):
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        assert signer_info["version"].native == "v1"
        assert signer_info["sid"].name == "issuer_and_serial_number"

    def test_no_unsigned_attributes(self, signature):
        """المواصفة تنصّ حرفياً: «may NOT contain any unsigned attributes»."""
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        assert signer_info["unsigned_attrs"].native is None

    def test_exactly_four_signed_attributes(self, signature):
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        present = {a["type"].native for a in signer_info["signed_attrs"]}
        assert present == {
            "content_type", "message_digest", "signing_time", "signing_certificate_v2",
        }


class TestAttributeValues:
    def test_message_digest_is_sha256_of_the_canonical_text(self, signature):
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        by_type = {a["type"].native: a["values"] for a in signer_info["signed_attrs"]}
        assert by_type["message_digest"][0].native == hashlib.sha256(CANONICAL).digest()

    def test_signing_certificate_hash_matches_the_embedded_certificate(self, signature, keypair):
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        by_type = {a["type"].native: a["values"] for a in signer_info["signed_attrs"]}
        declared = by_type["signing_certificate_v2"][0]["certs"][0]["cert_hash"].native
        assert declared == hashlib.sha256(keypair[1]).digest()

    def test_signing_time_is_utc(self, signature):
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        by_type = {a["type"].native: a["values"] for a in signer_info["signed_attrs"]}
        moment = by_type["signing_time"][0].native
        assert moment == WHEN
        assert moment.utcoffset().total_seconds() == 0

    def test_naive_signing_time_is_refused(self, keypair):
        """وقتٌ بلا منطقة زمنية يُنتج توقيعاً بوقتٍ خاطئ لا يُكتشف إلا عند التحكيم."""
        with pytest.raises(ValueError, match="منطقة زمنية"):
            build_signed_attributes(CANONICAL, keypair[1], datetime(2026, 9, 1, 12, 0, 0))

    def test_local_time_is_converted_not_rejected(self, keypair):
        cairo = timezone(timedelta(hours=3))
        attrs = build_signed_attributes(
            CANONICAL, keypair[1], datetime(2026, 9, 1, 15, 0, 0, tzinfo=cairo))
        by_type = {a["type"].native: a["values"] for a in attrs}
        assert by_type["signing_time"][0].native == WHEN


class TestCryptography:
    """
    التوقيع يقع على **ترميز `SET OF` للسمات**، لا على المستند ولا على
    البايتات كما ترد في الرسالة.

    وهذا أشهر عيوب CAdES: السمات تُحمل في الرسالة بوسمٍ ضمني `[0]`
    (البايت `0xA0`)، بينما RFC 5652 §5.4 يفرض التوقيع على ترميزٍ منفصل
    بوسم `SET OF` صريح (البايت `0x31`). فمن وقّع البايتات كما وجدها أنتج
    توقيعاً لا يتحقق عند أحد.

    وقد أوقعني هذا في أول تشغيل: أخفق الاختبار، والمُوقِّع سليم — كان
    الفحص يقارن بالوسم الخاطئ.
    """

    def test_the_two_encodings_differ_by_their_tag(self, signature):
        """إثبات الفرق نفسه، حتى لا يُنسى لماذا يوجد `untag()` أدناه."""
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        assert signer_info["signed_attrs"].dump()[0] == 0xA0          # في الرسالة
        assert signer_info["signed_attrs"].untag().dump()[0] == 0x31  # عند التوقيع

    def test_signature_verifies_over_the_signed_attributes(self, signature, keypair):
        key, _ = keypair
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        key.public_key().verify(
            signer_info["signature"].native,
            signer_info["signed_attrs"].untag().dump(),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )

    def test_signature_does_not_verify_over_the_implicit_tagged_form(self, signature, keypair):
        """الصيغة الخاطئة يجب ألا تتحقق — وإلا كان الاختبار أعلاه بلا معنى."""
        key, _ = keypair
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        with pytest.raises(InvalidSignature):
            key.public_key().verify(
                signer_info["signature"].native,
                signer_info["signed_attrs"].dump(),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )

    def test_signature_does_not_verify_over_the_document(self, signature, keypair):
        """لو صحّ على المستند لكان التوقيع مبنياً خطأً — وRFC 5652 §5.4 صريح."""
        key, _ = keypair
        signer_info = cms.ContentInfo.load(signature)["content"]["signer_infos"][0]
        with pytest.raises(InvalidSignature):
            key.public_key().verify(
                signer_info["signature"].native, CANONICAL,
                padding.PKCS1v15(), hashes.SHA256())

    def test_tampering_with_the_document_breaks_the_digest(self, signer):
        original = build_cades_bes(CANONICAL, signer, WHEN)
        assert inspect_cades_bes(original, CANONICAL).conformant
        report = inspect_cades_bes(original, CANONICAL + b" ")
        assert not report.conformant
        assert any("message-digest" in p for p in report.problems)


class TestInspectorCatchesTheTrap:
    """
    **الاختبار الذي يمنع الفاحص من أن يكون زينة.**

    نبني توقيعاً بإعدادات المكتبة الافتراضية — `id-data` بدل
    `id-digestedData` — ونُثبت أن الفاحص يرفضه. فلو مرّ، لمرّ كلُّ توقيعٍ
    خاطئ بعلامة خضراء.
    """

    @staticmethod
    def _sign_with(content_type: str, keypair, *, unsigned=False, two_certs=False):
        key, der = keypair
        certificate = cms.Certificate.load(der)
        attrs = cms.CMSAttributes([
            cms.CMSAttribute({"type": "content_type",
                              "values": [cms.ContentType(content_type)]}),
            cms.CMSAttribute({"type": "message_digest",
                              "values": [core.OctetString(hashlib.sha256(CANONICAL).digest())]}),
            cms.CMSAttribute({"type": "signing_time", "values": [cms.Time({"utc_time": WHEN})]}),
            cms.CMSAttribute({"type": "signing_certificate_v2",
                              "values": tsp.SetOfSigningCertificatesV2([tsp.SigningCertificateV2(
                                  {"certs": [tsp.ESSCertIDv2(
                                      {"cert_hash": hashlib.sha256(der).digest()})]})])}),
        ])
        info = {
            "version": "v1",
            "sid": cms.SignerIdentifier({"issuer_and_serial_number": cms.IssuerAndSerialNumber(
                {"issuer": certificate.issuer, "serial_number": certificate.serial_number})}),
            "digest_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
            "signed_attrs": attrs,
            "signature_algorithm": algos.SignedDigestAlgorithm({"algorithm": "rsassa_pkcs1v15"}),
            "signature": key.sign(attrs.dump(), padding.PKCS1v15(), hashes.SHA256()),
        }
        if unsigned:
            info["unsigned_attrs"] = cms.CMSAttributes([cms.CMSAttribute(
                {"type": "counter_signature", "values": []})])
        certificates = [certificate, certificate] if two_certs else [certificate]
        return cms.ContentInfo({"content_type": "signed_data", "content": cms.SignedData({
            "version": "v3",
            "digest_algorithms": [algos.DigestAlgorithm({"algorithm": "sha256"})],
            "encap_content_info": {"content_type": content_type},
            "certificates": certificates,
            "signer_infos": [cms.SignerInfo(info)],
        })}).dump()

    def test_default_id_data_is_rejected(self, keypair):
        broken = self._sign_with("1.2.840.113549.1.7.1", keypair)
        report = inspect_cades_bes(broken, CANONICAL)
        assert not report.conformant
        assert any("id-digestedData" in p for p in report.problems), report.problems

    def test_extra_certificates_are_rejected(self, keypair):
        broken = self._sign_with(ID_DIGESTED_DATA, keypair, two_certs=True)
        report = inspect_cades_bes(broken, CANONICAL)
        assert not report.conformant
        assert any("الشهادات" in p for p in report.problems), report.problems

    def test_unsigned_attributes_are_rejected(self, keypair):
        broken = self._sign_with(ID_DIGESTED_DATA, keypair, unsigned=True)
        report = inspect_cades_bes(broken, CANONICAL)
        assert not report.conformant
        assert any("غير موقَّعة" in p for p in report.problems), report.problems

    def test_our_own_signature_passes_the_same_inspector(self, signature):
        assert inspect_cades_bes(signature, CANONICAL).conformant


class TestEndToEnd:
    """من مستند إلى توقيع — الطريق الذي يسلكه المستعمل."""

    def test_document_to_signature(self, signer):
        document = load_document('{"totalAmount": 1150.00, "taxTotals": [{"amount": 150.00}]}')
        canonical = serialize_document(document).encode("utf-8")
        signature = build_cades_bes(canonical, signer, WHEN)
        report = inspect_cades_bes(signature, canonical)
        assert report.conformant, report.problems
        # والتجزئة المُعلنة في التوقيع هي نفسها تجزئة المستند الكنسية
        declared = report.details["message_digest_matches"]
        assert declared is True
        assert canonical_hash(document) == hashlib.sha256(canonical).hexdigest().upper()

    def test_signature_is_deterministic_given_the_same_time(self, signer):
        first = build_cades_bes(CANONICAL, signer, WHEN)
        second = build_cades_bes(CANONICAL, signer, WHEN)
        assert first == second, "التوقيع غير حتمي رغم ثبات الوقت والمفتاح"

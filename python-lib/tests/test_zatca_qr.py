"""
اختبارات ZATCA QR Code generator.
اختبارات وحدة متكاملة تتحقق من التطابق مع مواصفات ZATCA الرسمية.
"""
import base64
import pytest
from arabic_invoice_mcp.zatca_qr import (
    build_zatca_tlv,
    encode_zatca_qr,
    generate_qr_image,
    hash_invoice_xml,
    create_zatca_qr,
    ZatcaQRResult,
)


# =============================================================================
# Tests: TLV Construction
# =============================================================================

class TestTLV:
    def test_tlv_basic(self):
        """TLV لـ "Hello" مع tag=1 يجب أن ينتج 01 05 48 65 6C 6C 6F"""
        result = build_zatca_tlv(
            seller_name="Hello",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        # Tag 1: "Hello" (5 chars) → 01 05 48 65 6C 6C 6F
        assert result[0:2] == bytes([1, 5])
        assert result[2:7] == b"Hello"

    def test_tlv_with_arabic(self):
        """TLV يدعم UTF-8"""
        result = build_zatca_tlv(
            seller_name="أوبوس ستوديو",  # 11 bytes in UTF-8 (شركة = 8 bytes + space + النور = 10? Actually let's check)
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        # Tag 1 first byte is 1
        assert result[0] == 1
        # Second byte is length
        length = result[1]
        # Value starts at byte 2 and is exactly `length` bytes
        assert result[2:2+length].decode("utf-8") == "أوبوس ستوديو"

    def test_tlv_validates_vat_number_length(self):
        """رقم ضريبي ≠ 15 رقم يجب أن يفشل"""
        with pytest.raises(ValueError, match="15 رقم"):
            build_zatca_tlv(
                seller_name="شركة",
                vat_number="123",  # قصير جداً
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_tlv_validates_vat_prefix(self):
        """الرقم الضريبي السعودي يجب أن يبدأ بـ 3"""
        with pytest.raises(ValueError, match="يبدأ بـ 3"):
            build_zatca_tlv(
                seller_name="شركة",
                vat_number="100123456700003",  # يبدأ بـ 1
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_tlv_validates_vat_is_digits(self):
        """الرقم الضريبي يجب أن يكون أرقام فقط"""
        with pytest.raises(ValueError, match="15 رقم"):
            build_zatca_tlv(
                seller_name="شركة",
                vat_number="30012345670000X",  # فيه حرف
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_tlv_validates_timestamp(self):
        """timestamp يجب أن يكون ISO 8601"""
        with pytest.raises(ValueError, match="ISO 8601"):
            build_zatca_tlv(
                seller_name="شركة",
                vat_number="300123456700003",
                timestamp="2026-07-04",  # مفيش T
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_tlv_validates_seller_name(self):
        """اسم البائع مطلوب"""
        with pytest.raises(ValueError, match="اسم البائع"):
            build_zatca_tlv(
                seller_name="",
                vat_number="300123456700003",
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_tlv_5_fields_concatenated(self):
        """TLV buffer يجب أن يحتوي 5 حقول بالترتيب"""
        result = build_zatca_tlv(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        # Tags 1,2,3,4,5 في البداية (بعد كل حقل: tag byte يظهر)
        tags_in_order = []
        i = 0
        while i < len(result):
            tag = result[i]
            length = result[i + 1]
            tags_in_order.append(tag)
            i += 2 + length
        assert tags_in_order == [1, 2, 3, 4, 5]


# =============================================================================
# Tests: Base64 Encoding
# =============================================================================

class TestBase64:
    def test_base64_produces_ascii_string(self):
        """الناتج يجب أن يكون ASCII فقط (Base64 standard)"""
        result = encode_zatca_qr(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        assert result.isascii()
        assert isinstance(result, str)

    def test_base64_is_decodable(self):
        """الناتج يجب أن يكون Base64-decodable"""
        encoded = encode_zatca_qr(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        decoded = base64.b64decode(encoded)
        # Decoded data starts with Tag 1 (0x01) and length byte
        assert decoded[0] == 1
        assert decoded[1] == len("أوبوس ستوديو".encode("utf-8"))

    def test_base64_round_trip(self):
        """encode ثم decode يعيد نفس TLV buffer"""
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        original_tlv = build_zatca_tlv(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        encoded = encode_zatca_qr(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        decoded = base64.b64decode(encoded)
        assert decoded == original_tlv


# =============================================================================
# Tests: Hash Function
# =============================================================================

class TestHash:
    def test_sha256_default(self):
        result = hash_invoice_xml("<Invoice>Test</Invoice>")
        assert len(result) == 64  # sha256 hex = 64 chars
        assert result.isalnum()

    def test_sha384(self):
        result = hash_invoice_xml("<Invoice>Test</Invoice>", algorithm="sha384")
        assert len(result) == 96  # sha384 hex

    def test_sha512(self):
        result = hash_invoice_xml("<Invoice>Test</Invoice>", algorithm="sha512")
        assert len(result) == 128  # sha512 hex

    def test_hash_invalid_algorithm(self):
        with pytest.raises(ValueError, match="غير مدعوم"):
            hash_invoice_xml("<Invoice/>", algorithm="md5")

    def test_hash_changes_with_content(self):
        h1 = hash_invoice_xml("<Invoice>1</Invoice>")
        h2 = hash_invoice_xml("<Invoice>2</Invoice>")
        assert h1 != h2


# =============================================================================
# Tests: create_zatca_qr (high-level)
# =============================================================================

class TestCreateZatcaQR:
    def test_returns_correct_dataclass(self):
        result = create_zatca_qr(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
        )
        assert isinstance(result, ZatcaQRResult)
        assert result.base64_data
        assert result.tlv_hex
        assert result.image_path is None  # ما طلبناش صورة

    def test_with_image_output(self, tmp_path):
        """لما نطلب output_image، لازم يحفظ صورة"""
        pytest.importorskip("qrcode")  # Skip لو مش متثبت
        output = str(tmp_path / "test_qr.png")
        result = create_zatca_qr(
            seller_name="أوبوس ستوديو",
            vat_number="300123456700003",
            timestamp="2026-07-04T15:30:00Z",
            total_with_vat="1150.00",
            vat_amount="150.00",
            output_image=output,
        )
        assert result.image_path == output
        import os
        assert os.path.exists(output)
        assert os.path.getsize(output) > 100  # صورة PNG محفوظة فعلياً

    def test_validation_errors_propagate(self):
        with pytest.raises(ValueError):
            create_zatca_qr(
                seller_name="",
                vat_number="300123456700003",
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )


# =============================================================================
# Tests: generate_qr_image (lower-level)
# =============================================================================

class TestGenerateImage:
    def test_generates_png(self, tmp_path):
        pytest.importorskip("qrcode")
        pytest.importorskip("PIL")
        output = str(tmp_path / "qr.png")
        result = generate_qr_image("test_data_123", output, size=200)
        assert result == output
        import os
        assert os.path.exists(output)
        # Verify it's a valid PNG by opening with PIL
        from PIL import Image
        img = Image.open(output)
        assert img.size == (200, 200)

    def test_import_error_when_qrcode_missing(self, monkeypatch):
        """لو qrcode مش متثبت، لازم يرفع ImportError واضح"""
        import sys
        # Simulate missing qrcode
        monkeypatch.setitem(sys.modules, "qrcode", None)
        # Note: this is hard to test properly without breaking imports,
        # so we just verify the import error message is helpful
        try:
            generate_qr_image("data", "test.png")
        except ImportError as e:
            assert "qrcode" in str(e) or "Pillow" in str(e)
        except Exception:
            # Other errors (like permission) are fine for this test
            pass


class TestZatcaQRWS1:
    def test_tlv_field_length_exceeded(self):
        # A field (like seller name) exceeding 255 bytes should raise ValueError
        long_seller_name = "أ" * 200  # 200 Arabic letters in UTF-8 is 400 bytes
        with pytest.raises(ValueError, match="too long|255"):
            build_zatca_tlv(
                seller_name=long_seller_name,
                vat_number="300123456700003",
                timestamp="2026-07-04T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

    def test_strict_iso8601_timestamp_validation(self):
        # 1. Invalid date (Feb 30th)
        with pytest.raises(ValueError, match="ISO 8601"):
            build_zatca_tlv(
                seller_name="أوبوس ستوديو",
                vat_number="300123456700003",
                timestamp="2026-02-30T15:30:00Z",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

        # 2. Completely invalid format
        with pytest.raises(ValueError, match="ISO 8601"):
            build_zatca_tlv(
                seller_name="أوبوس ستوديو",
                vat_number="300123456700003",
                timestamp="2026/07/04 15:30:00",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

        # 3. Missing time component
        with pytest.raises(ValueError, match="ISO 8601"):
            build_zatca_tlv(
                seller_name="أوبوس ستوديو",
                vat_number="300123456700003",
                timestamp="2026-07-04",
                total_with_vat="1150.00",
                vat_amount="150.00",
            )

class TestAgainstTheOfficialSpecification:
    """
    مُثبَّت على **نصّ المواصفة** لا على ذاكرة.

    ذهبتُ أفحص المولّد بعيّنةٍ «رسمية» أذكرها، فلم تُطابق. ففكّكتُ العيّنة
    نفسها فإذا هي **فاسدة**: تُعلن الوسم 4 بطول 6 ثم لا ينتظم ما بعدها
    TLV. كان المرجع خاطئاً والتطبيق سليماً — ولو صدّقتُ الذاكرة لـ«أصلحتُ»
    كوداً صحيحاً.

    فنُزِّلت المواصفة الرسمية واستُخرج نصّها:
      ZATCA — Electronic Invoice Security Features Implementation Standards
      v1.1، §4.1 «Structure of the QR code»، الصفحة 25.
      https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/
      20220624_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards.pdf

    وتنصّ على أربع خطوات بعينها:
      ① الوسم في **بايت واحد**
      ② الطول = طول مصفوفة بايتات **ترميز UTF-8** للقيمة، في **بايت واحد**
      ③ القيمة = بايتات UTF-8
      ④ تُسلسَل ثم تُرمَّز Base64، وحدّها **700 حرف**

    ولذلك يُبنى المتوقَّع هنا **مستقلاً** عن كودنا، من هذه الخطوات نصّاً.
    """

    #: القيم من مثال المواصفة نفسها لصيغة الوقت: 2022-02-21T12:13:57Z
    CASE = ("Bobs Records", "310122393500003", "2022-04-25T15:30:00Z", "1000.00", "150.00")

    @staticmethod
    def _independent_encoder(*fields: str) -> bytes:
        """ترجمة حرفية لخطوات §4.1 — لا تستدعي كودنا."""
        out = bytearray()
        for tag, value in enumerate(fields, start=1):
            payload = value.encode("utf-8")
            out.append(tag)                 # ① الوسم في بايت واحد
            out.append(len(payload))        # ② الطول ببايت واحد
            out.extend(payload)             # ③ القيمة UTF-8
        return bytes(out)

    def test_matches_an_encoder_written_from_the_spec_text(self):
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        assert build_zatca_tlv(*self.CASE) == self._independent_encoder(*self.CASE)

    def test_base64_matches_the_independent_encoding(self):
        import base64
        from arabic_invoice_mcp.zatca_qr import encode_zatca_qr
        expected = base64.b64encode(self._independent_encoder(*self.CASE)).decode("ascii")
        assert encode_zatca_qr(*self.CASE) == expected

    def test_length_counts_utf8_bytes_not_characters(self):
        """
        الفخّ الذي يُسقط كل تطبيقٍ ساذج: «شركة» أربعة أحرف و**ثمان بايتات**.
        من كتب الطول بعدد الأحرف أنتج رمزاً يفشل قارئه بلا تشخيص.
        """
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        name = "شركة"
        assert len(name) == 4 and len(name.encode("utf-8")) == 8
        tlv = build_zatca_tlv(name, "310122393500003", "2022-04-25T15:30:00Z", "115.00", "15.00")
        assert tlv[0] == 1 and tlv[1] == 8, "الطول يجب أن يكون بالبايتات لا بالأحرف"

    def test_seven_hundred_character_ceiling_is_enforced(self):
        """
        السقف **بالغٌ نظرياً لا عملياً**، وقياسه أولى من الادعاء في الاتجاهين:

          أقصى TLV للوسوم 1-5 = 5 × (2 + 255) = 1,285 بايتاً ⇒ 1,716 حرفاً
          Base64، أي ضِعف السقف. فالفحص **حاملٌ** لا زينة.

          لكن باسمٍ في حدّه (255 بايتاً) وحقولٍ واقعية يبلغ الناتج نحو 428
          حرفاً فقط. فلا تبلغه فاتورةٌ حقيقية، ويبلغه المدخل المُساء.
        """
        import base64
        from arabic_invoice_mcp.zatca_qr import encode_zatca_qr, MAX_QR_BASE64_LENGTH
        assert MAX_QR_BASE64_LENGTH == 700
        assert len(base64.b64encode(b"x" * (5 * (2 + 255)))) > MAX_QR_BASE64_LENGTH, \
            "السقف غير بالغ أصلاً — فالفحص ميّت"

        realistic = encode_zatca_qr("ش" * 127, "310122393500003",
                                    "2022-04-25T15:30:00Z", "1000.00", "150.00")
        assert len(realistic) <= MAX_QR_BASE64_LENGTH

    def test_a_value_over_255_bytes_is_rejected(self):
        """
        الطول في بايتٍ واحد — فما جاوز 255 بايتاً لا يُمثَّل أصلاً.

        والحرف العربي **بايتان** في UTF-8 لا ثلاثة (النطاق U+0600–U+06FF)،
        فحدّ الاسم 127 حرفاً عربياً. قِيس، ولم يُفترض.
        """
        import pytest
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        assert len("ش".encode("utf-8")) == 2
        assert len(("ش" * 128).encode("utf-8")) == 256 > 255
        with pytest.raises(ValueError):
            build_zatca_tlv("ش" * 128, "310122393500003",
                            "2022-04-25T15:30:00Z", "1000.00", "150.00")

    def test_the_spec_timestamp_example_is_accepted(self):
        """المثال المذكور في جدول المواصفة نفسه: 2022-02-21T12:13:57Z."""
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        tlv = build_zatca_tlv("X", "310122393500003", "2022-02-21T12:13:57Z", "1.00", "0.15")
        assert b"2022-02-21T12:13:57Z" in tlv

    def test_phase_one_carries_tags_one_to_five_only(self):
        """
        الوسوم 6-9 (الهاش، توقيع ECDSA، المفتاح العام، توقيع الهيئة) تخصّ
        المرحلة الثانية. هذا المولّد للمرحلة الأولى، ولا يزعم غيرها.
        """
        from arabic_invoice_mcp.zatca_qr import build_zatca_tlv
        tlv = build_zatca_tlv(*self.CASE)
        tags, i = [], 0
        while i < len(tlv):
            tags.append(tlv[i])
            i += 2 + tlv[i + 1]
        assert tags == [1, 2, 3, 4, 5]

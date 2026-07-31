"""
ZATCA-Compliant QR Code Generator
=================================
توليد QR code للفاتورة الإلكترونية متوافقة مع هيئة الزكاة والضريبة والجمارك السعودية (ZATCA).

المواصفات (Phase 1 — B2C):
- 5 حقول بصيغة TLV (Tag-Length-Value)
- Base64-encoded UTF-8
- QR code ISO/IEC 18004

المرجع: ZATCA E-Invoicing Technical Specification
"""

from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass
from typing import Optional

# Strict ISO-8601 pattern: YYYY-MM-DDTHH:MM:SS with mandatory timezone
_ISO8601_STRICT = re.compile(
    r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'  # YYYY-MM-DDTHH:MM:SS
    r'(?:\.\d+)?'                               # optional fractional seconds
    r'(?:Z|[+-]\d{2}:\d{2})$'                   # required timezone
)


def _tlv(tag: int, value: str) -> bytes:
    """
    بناء TLV field: Tag (1 byte) + Length (1 byte) + Value (UTF-8 bytes).

    Args:
        tag: رقم الحقل (1-5)
        value: القيمة كنص UTF-8

    Returns:
        bytes بالـ TLV format
    """
    encoded = value.encode("utf-8")
    # ZATCA spec: length is single byte (max 255) for Phase 1
    if len(encoded) > 255:
        raise ValueError(f"TLV value too long ({len(encoded)} bytes). Max is 255 for Phase 1.")
    return bytes([tag, len(encoded)]) + encoded


def build_zatca_tlv(
    seller_name: str,
    vat_number: str,
    timestamp: str,
    total_with_vat: str,
    vat_amount: str,
) -> bytes:
    """
    بناء TLV buffer للـ ZATCA-compliant QR.

    Args:
        seller_name: اسم البائع (Tag 1)
        vat_number: الرقم الضريبي (Tag 2) — 15 رقم يبدأ بـ 3
        timestamp: تاريخ ووقت الفاتورة ISO 8601 (Tag 3) — مثال: "2026-07-04T15:30:00Z"
        total_with_vat: الإجمالي شامل الضريبة (Tag 4) — مثال: "1150.00"
        vat_amount: مبلغ الضريبة (Tag 5) — مثال: "150.00"

    Returns:
        bytes جاهز للـ Base64 encoding

    Raises:
        ValueError: لو أي حقل غير صالح
    """
    # Validation
    if not seller_name or not seller_name.strip():
        raise ValueError("اسم البائع مطلوب")
    if not vat_number or len(vat_number) != 15 or not vat_number.isdigit():
        raise ValueError(f"الرقم الضريبي يجب أن يكون 15 رقم (الحالي: {vat_number!r})")
    if not vat_number.startswith("3"):
        raise ValueError("الرقم الضريبي السعودي يجب أن يبدأ بـ 3")
    if not timestamp or not _ISO8601_STRICT.match(timestamp.strip()):
        raise ValueError(f"التاريخ يجب أن يكون ISO 8601 format مع timezone (الحالي: {timestamp!r})")
    try:
        from datetime import datetime
        datetime.fromisoformat(timestamp.strip())
    except Exception as e:
        raise ValueError(f"التاريخ يجب أن يكون بصيغة ISO 8601 صالحة (الحالي: {timestamp!r})") from e
    if not total_with_vat or not vat_amount:
        raise ValueError("المبالغ مطلوبة")

    return (
        _tlv(1, seller_name.strip())
        + _tlv(2, vat_number.strip())
        + _tlv(3, timestamp.strip())
        + _tlv(4, str(total_with_vat).strip())
        + _tlv(5, str(vat_amount).strip())
    )


def encode_zatca_qr(
    seller_name: str,
    vat_number: str,
    timestamp: str,
    total_with_vat: str,
    vat_amount: str,
) -> str:
    """
    إنشاء نص QR code كاملاً (Base64) — جاهز للـ QR encoding.

    Args:
        seller_name: اسم البائع
        vat_number: الرقم الضريبي (15 رقم)
        timestamp: ISO 8601 datetime
        total_with_vat: الإجمالي شامل الضريبة
        vat_amount: مبلغ الضريبة

    Returns:
        نص Base64 — يتم تحويله لـ QR code

    Example:
        >>> encode_zatca_qr(
        ...     "Opus Studio",
        ...     "300123456700003",
        ...     "2026-07-04T15:30:00Z",
        ...     "1150.00",
        ...     "150.00"
        ... )
        'Ak5vciDihqjih4...'
    """
    tlv_buffer = build_zatca_tlv(seller_name, vat_number, timestamp, total_with_vat, vat_amount)
    return base64.b64encode(tlv_buffer).decode("ascii")


def generate_qr_image(
    qr_data: str,
    output_path: str,
    size: int = 300,
    border: int = 4,
    error_correction: str = "M",
) -> str:
    """
    توليد صورة QR code من البيانات المُعدّة.

    Args:
        qr_data: النص (ناتج encode_zatca_qr)
        output_path: مسار حفظ الصورة
        size: حجم الصورة بالـ pixels
        border: عرض الإطار الأبيض (default 4)
        error_correction: مستوى تصحيح الخطأ (L/M/Q/H)

    Returns:
        مسار الصورة المحفوظة

    Requires:
        pip install qrcode[pil]
    """
    try:
        import qrcode
        from qrcode.constants import (
            ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H,
        )
    except ImportError:
        raise ImportError(
            "مطلوب تثبيت qrcode: pip install qrcode[pil]\n"
            "أو: pip install arabic-invoice-mcp[qr]"
        )

    ec_map = {
        "L": ERROR_CORRECT_L,  # ~7%
        "M": ERROR_CORRECT_M,  # ~15%
        "Q": ERROR_CORRECT_Q,  # ~25%
        "H": ERROR_CORRECT_H,  # ~30%
    }

    qr = qrcode.QRCode(
        version=None,  # auto
        error_correction=ec_map.get(error_correction.upper(), ERROR_CORRECT_M),
        box_size=10,
        border=border,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    # Resize to requested size
    img = img.resize((size, size))
    img.save(output_path)

    return output_path


def hash_invoice_xml(xml_content: str, algorithm: str = "sha256") -> str:
    """
    حساب hash للفاتورة XML (مطلوب لـ ZATCA Phase 2).

    Args:
        xml_content: محتوى XML
        algorithm: خوارزمية الـ hash (sha256, sha384, sha512)

    Returns:
        الـ hash كـ hex string
    """
    if algorithm not in ("sha256", "sha384", "sha512"):
        raise ValueError(f"Algorithm غير مدعوم: {algorithm}")
    hasher = hashlib.new(algorithm)
    hasher.update(xml_content.encode("utf-8"))
    return hasher.hexdigest()


@dataclass
class ZatcaQRResult:
    """نتيجة توليد QR code — نتيجتين (نص Base64 + مسار الصورة اختياري)."""
    base64_data: str
    image_path: Optional[str] = None
    tlv_hex: Optional[str] = None

    def __repr__(self) -> str:
        preview = self.base64_data[:30] + "..."
        return f"ZatcaQRResult(data={preview!r}, image={self.image_path!r})"


def create_zatca_qr(
    seller_name: str,
    vat_number: str,
    timestamp: str,
    total_with_vat: str,
    vat_amount: str,
    output_image: Optional[str] = None,
    image_size: int = 300,
) -> ZatcaQRResult:
    """
    Convenience function: ينشئ QR code كاملاً (نص + صورة اختيارية).

    Args:
        seller_name: اسم البائع
        vat_number: الرقم الضريبي (15 رقم)
        timestamp: ISO 8601 datetime
        total_with_vat: الإجمالي شامل الضريبة
        vat_amount: مبلغ الضريبة
        output_image: مسار حفظ الصورة (None = نص فقط)
        image_size: حجم الصورة بـ pixels

    Returns:
        ZatcaQRResult مع البيانات والصورة (لو طُلبت)

    Example:
        >>> result = create_zatca_qr(
        ...     "Opus Studio",
        ...     "300123456700003",
        ...     "2026-07-04T15:30:00Z",
        ...     "1150.00",
        ...     "150.00",
        ...     output_image="invoice_qr.png"
        ... )
        >>> print(result.base64_data)
        >>> print(f"QR saved at: {result.image_path}")
    """
    base64_data = encode_zatca_qr(seller_name, vat_number, timestamp, total_with_vat, vat_amount)

    image_path = None
    if output_image:
        image_path = generate_qr_image(base64_data, output_image, size=image_size)

    tlv_buffer = build_zatca_tlv(seller_name, vat_number, timestamp, total_with_vat, vat_amount)

    return ZatcaQRResult(
        base64_data=base64_data,
        image_path=image_path,
        tlv_hex=tlv_buffer.hex(),
    )


__all__ = [
    "build_zatca_tlv",
    "encode_zatca_qr",
    "generate_qr_image",
    "hash_invoice_xml",
    "ZatcaQRResult",
    "create_zatca_qr",
]
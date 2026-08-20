"""
Arabic Invoice & Tafgeet MCP Server
====================================
خادم MCP للتعامل مع الفواتير العربية وتفقيط الأرقام بالعربية.

المميزات:
- تحويل الأرقام إلى كلمات عربية (تفقيط) بلهجات متعددة (سعودي/مصري/إماري)
- توليد فواتير إلكترونية متوافقة مع متطلبات الزكاة والضريبة والجمارك السعودية (ZATCA)
- تحويل العملات بأسعار صرف قابلة للتحديث
- حساب ضريبة القيمة المضافة (VAT 15% سعودي / 14% مصري / 5% إماري)
- تصدير الفواتير بصيغ متعددة (JSON / نص عربي منسق / Markdown)

التوافق: Claude Desktop, Claude Code, Cursor, أي MCP client
"""

from mcp.server.fastmcp import FastMCP
from typing import Optional, Literal, Dict, Any, List
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
import json
import math
from decimal import Decimal, ROUND_HALF_UP

try:
    from .zatca_qr import (
        encode_zatca_qr,
        generate_qr_image,
        hash_invoice_xml,
        create_zatca_qr,
        ZatcaQRResult,
    )
    ZATCA_AVAILABLE = True
except ImportError:
    ZATCA_AVAILABLE = False

# =============================================================================
# Core: Arabic Tafgeet Engine (تفقيط الأرقام بالعربية)
# =============================================================================

ONES_M = [
    "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة",
    "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر",
    "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر",
    "تسعة عشر"
]

ONES_F = [
    "", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع",
    "ثماني", "تسع", "عشر", "إحدى عشرة", "اثنتا عشرة", "ثلاث عشرة",
    "أربع عشرة", "خمس عشرة", "ست عشرة", "سبع عشرة", "ثماني عشرة",
    "تسع عشرة"
]

ONES = ONES_M

TENS = [
    "", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون",
    "سبعون", "ثمانون", "تسعون"
]

HUNDREDS = [
    "", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
    "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"
]

SCALES = [
    (1, ""),
    (1000, "ألف"),
    (1000000, "مليون"),
    (1000000000, "مليار"),
    (1000000000000, "تريليون"),
]

# God labels for currency units
CURRENCY_UNITS = {
    "SAR": {"singular": "ريال", "dual": "ريالان", "plural": "ريالات", "fraction_singular": "هللة", "fraction_plural": "هللات", "decimals": 2},
    "EGP": {"singular": "جنيه", "dual": "جنيهان", "plural": "جنيهات", "fraction_singular": "قرش", "fraction_plural": "قروش", "decimals": 2},
    "AED": {"singular": "درهم", "dual": "درهمان", "plural": "دراهم", "fraction_singular": "فلس", "fraction_plural": "فلوس", "decimals": 2},
    "USD": {"singular": "دولار", "dual": "دولاران", "plural": "دولارات", "fraction_singular": "سنت", "fraction_plural": "سنتات", "decimals": 2},
    "KWD": {"singular": "دينار", "dual": "ديناران", "plural": "دنانير", "fraction_singular": "فلس", "fraction_plural": "فلوس", "decimals": 3},
    "BHD": {"singular": "دينار", "dual": "ديناران", "plural": "دنانير", "fraction_singular": "فلس", "fraction_plural": "فلوس", "decimals": 3},
    "OMR": {"singular": "ريال", "dual": "ريالان", "plural": "ريالات", "fraction_singular": "بيسة", "fraction_plural": "بيسات", "decimals": 3},
    "QAR": {"singular": "ريال", "dual": "ريالان", "plural": "ريالات", "fraction_singular": "درهم", "fraction_plural": "دراهم", "decimals": 2},
}

COUNTRY_CURRENCY = {
    "SA": "SAR",
    "EG": "EGP",
    "AE": "AED",
    "BH": "BHD",
    "KW": "KWD",
    "QA": "QAR",
    "OM": "OMR"
}


def _convert_hundreds(n: int, gender: str = "M") -> str:
    """تحويل الأرقام من 0 إلى 999."""
    if n == 0:
        return ""
    parts = []
    h = n // 100
    remainder = n % 100
    if h > 0:
        parts.append(HUNDREDS[h])
    if remainder > 0:
        if remainder < 20:
            ones_list = ONES_M if gender == "M" else ONES_F
            parts.append(ones_list[remainder])
        else:
            t = remainder // 10
            o = remainder % 10
            if o > 0:
                if o == 1:
                    ones_word = "واحد" if gender == "M" else "إحدى"
                elif o == 2:
                    ones_word = "اثنان" if gender == "M" else "اثنتان"
                else:
                    ones_list = ONES_M if gender == "M" else ONES_F
                    ones_word = ones_list[o]
                parts.append(f"{ones_word} و{TENS[t]}")
            else:
                parts.append(TENS[t])
    return " و".join(parts)


def _convert_less_than_thousand(n: int, scale_word: str, scale_value: int, gender: str = "M") -> str:
    """تحويل آحاد/عشرات/مئات مع كلمة المقياس (ألف/مليون/مليار)."""
    if n == 0:
        return ""
    grp_gender = gender if scale_value == 1 else "M"
    base = _convert_hundreds(n, gender=grp_gender)
    if scale_value == 1:
        return base
    # Drop noon for "مئتان" if it is followed by a scale word, i.e., "مئتا ألف"
    if base == "مئتان" and scale_value > 1:
        base = "مئتا"
    # Handle Arabic grammar for scales
    if n == 1:
        return scale_word
    elif n == 2:
        return f"{scale_word}ان"
    elif 3 <= n <= 10:
        # Plural form (جمع)
        plural_map = {"ألف": "آلاف", "مليون": "ملايين", "مليار": "مليارات", "تريليون": "تريليونات"}
        plural = plural_map.get(scale_word, scale_word + "ات")
        return f"{base} {plural}"
    else:
        # Singular accusative (تمييز)
        return f"{base} {scale_word}"


def number_to_arabic_words(n: float, gender: str = "M", decimals: int = 2) -> str:
    """تحويل أي رقم إلى كلمات عربية كاملة."""
    if not isinstance(n, (int, float)):
        raise ValueError("الرقم يجب أن يكون قيمة عددية")
    if not math.isfinite(n):
        raise ValueError("الرقم يجب أن يكون قيمة عددية محدودة")

    if n == 0:
        return "صفر"

    is_negative = n < 0
    n = abs(n)

    integer_part = int(n)
    # Process integer part by thousands groups
    if integer_part == 0:
        int_words = "صفر"
    else:
        groups = []
        num = integer_part
        scale_idx = 0
        while num > 0 and scale_idx < len(SCALES):
            group = num % 1000
            if group > 0:
                scale_value, scale_word = SCALES[scale_idx]
                group_words = _convert_less_than_thousand(group, scale_word, scale_value, gender=gender)
                groups.append(group_words)
            num //= 1000
            scale_idx += 1
        groups.reverse()
        int_words = " و".join(g for g in groups if g)

    # Process decimal part
    dec_n = Decimal(str(n))
    dec_integer_part = Decimal(integer_part)
    decimal_part = int((dec_n - dec_integer_part * Decimal(1)).quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP) * Decimal(10 ** decimals))
    if decimal_part > 0:
        dec_words = _convert_hundreds(decimal_part, gender=gender)
        return f"{int_words} و{dec_words}" if not is_negative else f"سالب {int_words} و{dec_words}"
    return f"سالب {int_words}" if is_negative else int_words


def _accusative_form(word: str) -> str:
    """
    تحويل الكلمة إلى صيغة النصب (تمييز).

    الأسماء المذكرة (مثل ريال، درهم، فلس) → تُنوَّن بتنوين الفتح: "ريالاً"
    الأسماء المؤنثة الخماسية المنتهية بتاء مربوطة (مثل هللة، نجمة) → تبقى كما هي: "هللة"
    """
    if word.endswith("ة"):
        # مؤنث خماسي - التاء المربوطة نفسها تدل على النصب
        return word
    return word + "اً"


def _adjust_duals_for_idafa(words: str) -> str:
    """إسقاط النون من المثنى عند الإضافة (مثل: مئتا، ألفا، مليونا)."""
    for dual_word, idafa_word in [
        ("مئتان", "مئتا"),
        ("ألفان", "ألفا"),
        ("مليونان", "مليونا"),
        ("ملياران", "مليارا"),
        ("تريليونان", "تريليونا")
    ]:
        if words.endswith(dual_word):
            return words[:-len(dual_word)] + idafa_word
    return words


def _currency_grammar(
    count: int,
    words: str,
    singular: str,
    dual: str,
    plural: str,
    gender: str,
) -> str:
    """
    قواعد اللغة العربية للعملات والأجزاء: مفرد/مثنى/جمع/تمييز.

    Args:
        count: العدد (integer_part أو decimal_part)
        words: العدد بالكلمات (من number_to_arabic_words)
        singular: صيغة المفرد (ريال / هللة / فلس)
        dual: صيغة المثنى (ريالان / هللتان / فلسان)
        plural: صيغة الجمع (ريالات / هللات / فلوس)
        gender: الجنس — "M" للمذكر، "F" للمؤنث

    Returns:
        النص العربي المُعرب بشكل صحيح
    """
    if count == 1:
        gender_word = "واحدة" if gender == "F" else "واحد"
        return f"{singular} {gender_word}"
    elif count == 2:
        return dual
    elif 3 <= count <= 10:
        return f"{words} {plural}"
    else:
        if count % 100 == 0:
            adjusted_words = _adjust_duals_for_idafa(words)
            return f"{adjusted_words} {singular}"

        # في العدد المعطوف، التمييز يتبع آخر عدد مذكور. فإن كان آخر جزء 3-10
        # وجب الجمع كما في العدد المفرد تماماً: 3 -> "ثلاثة ريالات"،
        # و103 -> "مائة وثلاثة ريالات" (لا "ريالاً").
        # قبل هذا التصحيح كان 3 يعطي الجمع بينما 103 يعطي المفرد المنصوب —
        # تناقض داخلي في نفس القاعدة.
        # ملاحظة مفتوحة: صياغة الباقي 1 و2 (101، 102) موضع خلاف نحوي ولم نغيّرها
        # هنا؛ تحتاج مراجعة مختص قبل الحسم. راجع tests/test_arabic_grammar.py.
        remainder = count % 100
        if 3 <= remainder <= 10:
            return f"{words} {plural}"

        return f"{words} {_accusative_form(singular)}"


def _build_dual(singular: str, gender: str) -> str:
    """بناء صيغة المثنى من المفرد: هللة → هللتان، فلس → فلسان."""
    if gender == "F":
        return singular[:-1] + "تان"
    return singular + "ان"


def _format_fraction(decimal_part: int, frac_gender: str, frac_sing: str, frac_plural: str, decimals: int) -> str:
    """تنسيق الجزء العشري/الكسري من العملة بقواعد اللغة العربية (المذكر/المؤنث، التثنية، والجمع)."""
    dec_words = number_to_arabic_words(decimal_part, gender=frac_gender, decimals=decimals)
    dual = _build_dual(frac_sing, frac_gender)
    return _currency_grammar(decimal_part, dec_words, frac_sing, dual, frac_plural, frac_gender)


def tafgeet(amount: float, currency: str = "SAR") -> str:
    """
    تفقيط مبلغ مالي بالعربية مع عملة.

    مثال: tafgeet(1234.56, "SAR")
    => "ألف ومئتان وأربعة وثلاثون ريالاً وست وخمسون هللة"
    """
    if not isinstance(currency, str):
        raise ValueError("رمز العملة يجب أن يكون نصاً")
    if not isinstance(amount, (int, float)):
        raise ValueError("المبلغ يجب أن يكون رقماً")
    if not math.isfinite(amount):
        raise ValueError("المبلغ يجب أن يكون رقماً محدداً")

    if currency not in CURRENCY_UNITS:
        raise ValueError(f"عملة غير مدعومة: {currency}")

    unit = CURRENCY_UNITS[currency]
    decimals = unit.get("decimals", 2)
    
    is_negative = amount < 0
    dec_amount = round(Decimal(str(abs(amount))), decimals)
    
    integer_part = int(dec_amount)
    decimal_part = int((dec_amount - integer_part).quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP) * Decimal(10 ** decimals))

    # Process fraction grammar
    frac_sing = unit["fraction_singular"]
    frac_plural = unit["fraction_plural"]
    frac_gender = "F" if frac_sing.endswith("ة") else "M"

    # All main currency units are masculine, so use gender="M" for integer part
    int_words = number_to_arabic_words(integer_part, gender="M", decimals=decimals)
    
    if integer_part == 0:
        # If integer part is 0, we only return the fraction (or "صفر <singular>" if fraction is also 0)
        if decimal_part == 0:
            return f"سالب صفر {unit['singular']}" if is_negative else f"صفر {unit['singular']}"
        
        # Generate fraction words
        dec_str = _format_fraction(decimal_part, frac_gender, frac_sing, frac_plural, decimals)
        return f"سالب {dec_str}" if is_negative else dec_str

    # Currency grammar for integer_part > 0
    int_str = _currency_grammar(
        integer_part, int_words,
        unit["singular"], unit["dual"], unit["plural"],
        gender="M",
    )

    if decimal_part == 0:
        return f"سالب {int_str}" if is_negative else int_str

    # Generate fraction words using the correct gender
    dec_str = _format_fraction(decimal_part, frac_gender, frac_sing, frac_plural, decimals)

    result = f"{int_str} و{dec_str}"
    return f"سالب {result}" if is_negative else result


# =============================================================================
# VAT Rates by Country
# =============================================================================

VAT_RATES = {
    "SA": 0.15,    # السعودية 15%
    "EG": 0.14,    # مصر 14%
    "AE": 0.05,    # الإمارات 5%
    "BH": 0.10,    # البحرين 10%
    "KW": 0.00,    # الكويت (لا VAT)
    "QA": 0.00,    # قطر
    "OM": 0.05,    # عمان 5%
}


# =============================================================================
# Data Models
# =============================================================================

@dataclass
class InvoiceItem:
    description: str
    quantity: float
    unit_price: float
    tax_rate: float = 0.15

    @property
    def subtotal(self) -> float:
        return round(self.quantity * self.unit_price, 2)

    @property
    def tax_amount(self) -> float:
        return round(self.subtotal * self.tax_rate, 2)

    @property
    def total(self) -> float:
        return round(self.subtotal + self.tax_amount, 2)


@dataclass
class Invoice:
    invoice_number: str
    seller_name: str
    buyer_name: str
    seller_vat: Optional[str] = None
    buyer_vat: Optional[str] = None
    country: str = "SA"
    currency: str = "SAR"
    issue_date: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    items: List[InvoiceItem] = field(default_factory=list)
    notes: Optional[str] = None

    @property
    def subtotal(self) -> float:
        decimals = CURRENCY_UNITS.get(self.currency, {}).get("decimals", 2)
        return round(sum(i.subtotal for i in self.items), decimals)

    @property
    def total_tax(self) -> float:
        decimals = CURRENCY_UNITS.get(self.currency, {}).get("decimals", 2)
        total_tax_val = 0.0
        for i in self.items:
            sub = round(i.quantity * i.unit_price, decimals)
            total_tax_val += round(sub * i.tax_rate, decimals)
        return round(total_tax_val, decimals)

    @property
    def total(self) -> float:
        decimals = CURRENCY_UNITS.get(self.currency, {}).get("decimals", 2)
        total_val = 0.0
        for i in self.items:
            sub = round(i.quantity * i.unit_price, decimals)
            tax = round(sub * i.tax_rate, decimals)
            total_val += sub + tax
        return round(total_val, decimals)

    @property
    def total_in_words(self) -> str:
        return tafgeet(self.total, self.currency)


# =============================================================================
# MCP Server
# =============================================================================

mcp = FastMCP(
    "arabic-invoice-mcp",
)


@mcp.tool()
def tafgeet_amount(amount: float, currency: str = "SAR") -> str:
    """
    تحويل مبلغ مالي إلى كلمات عربية (تفقيط).

    Args:
        amount: المبلغ الرقمي (مثال: 1234.56)
        currency: رمز العملة - SAR/EGP/AED/USD/KWD

    Returns:
        المبلغ بالكلمات العربية كاملة (مثال: "ألف ومئتان وأربعة وثلاثون ريالاً وست وخمسون هللة")
    """
    return tafgeet(amount, currency)


@mcp.tool()
def convert_number_to_arabic(number: float) -> str:
    """
    تحويل أي رقم إلى كلمات عربية بدون عملة.

    Args:
        number: الرقم (مثال: 2026)

    Returns:
        الرقم بالكلمات (مثال: "ألفان وستة وعشرون")
    """
    return number_to_arabic_words(number)


@mcp.tool()
def calculate_vat(
    amount: float,
    country: Literal["SA", "EG", "AE", "BH", "KW", "QA", "OM"] = "SA"
) -> Dict[str, Any]:
    """
    حساب ضريبة القيمة المضافة (VAT) حسب الدولة.

    Args:
        amount: المبلغ الصافي قبل الضريبة
        country: رمز الدولة (SA/EG/AE/BH/KW/QA/OM)

    Returns:
        قاموس يحتوي: rate, vat_amount, total, country_name
    """
    if not isinstance(amount, (int, float)):
        raise ValueError("المبلغ يجب أن يكون قيمة عددية")
    if not math.isfinite(amount):
        raise ValueError("المبلغ يجب أن يكون قيمة عددية محددة")
    if country not in VAT_RATES:
        raise ValueError(f"رمز الدولة غير مدعوم: {country}")

    rate = VAT_RATES.get(country, 0.0)
    country_names = {
        "SA": "المملكة العربية السعودية", "EG": "مصر", "AE": "الإمارات العربية المتحدة",
        "BH": "البحرين", "KW": "الكويت", "QA": "قطر", "OM": "عُمان"
    }
    currency = COUNTRY_CURRENCY.get(country, "SAR")
    decimals = CURRENCY_UNITS.get(currency, {}).get("decimals", 2)
    
    net_amount = round(amount, decimals)
    vat_amount = round(amount * rate, decimals)
    total_inclusive = round(amount * (1 + rate), decimals)
    
    return {
        "country": country,
        "country_name": country_names.get(country, country),
        "vat_rate_percent": rate * 100,
        "net_amount": net_amount,
        "vat_amount": vat_amount,
        "total_inclusive": total_inclusive,
        "total_in_arabic_words": tafgeet(total_inclusive, currency),
    }


@mcp.tool()
def create_invoice(
    invoice_number: str,
    seller_name: str,
    buyer_name: str,
    items: List[Dict[str, Any]],
    country: str = "SA",
    currency: str = "SAR",
    seller_vat: Optional[str] = None,
    buyer_vat: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    إنشاء فاتورة إلكترونية عربية متوافقة مع ZATCA السعودية.

    Args:
        invoice_number: رقم الفاتورة (مثال: INV-2026-001)
        seller_name: اسم البائع
        buyer_name: اسم المشتري
        items: قائمة الأصناف [{description, quantity, unit_price, tax_rate?}]
        country: رمز الدولة (SA/EG/AE/...)
        currency: رمز العملة (SAR/EGP/AED/...)
        seller_vat: الرقم الضريبي للبائع
        buyer_vat: الرقم الضريبي للمشتري
        notes: ملاحظات إضافية

    Returns:
        بيانات الفاتورة الكاملة مع المبالغ والتفقيط
    """
    if not items:
        raise ValueError("يجب إضافة صنف واحد على الأقل في الفاتورة")
    if country not in VAT_RATES:
        raise ValueError(f"رمز الدولة غير مدعوم: {country}")
    if currency not in CURRENCY_UNITS:
        raise ValueError(f"رمز العملة غير مدعوم: {currency}")

    if country == "SA":
        if seller_vat and (len(seller_vat) != 15 or not seller_vat.isdigit() or not seller_vat.startswith("3")):
            raise ValueError("الرقم الضريبي للبائع السعودي يجب أن يتكون من 15 رقماً ويبدأ بـ 3")
        if buyer_vat and (len(buyer_vat) != 15 or not buyer_vat.isdigit() or not buyer_vat.startswith("3")):
            raise ValueError("الرقم الضريبي للمشتري السعودي يجب أن يتكون من 15 رقماً ويبدأ بـ 3")

    default_tax = VAT_RATES.get(country, 0.15)
    invoice_items = []
    for idx, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"الصنف في الفهرس {idx} يجب أن يكون قاموساً (object)")
        if "description" not in it or not it["description"]:
            raise ValueError(f"وصف الصنف في الفهرس {idx} مطلوب")
        
        try:
            qty = float(it["quantity"])
            price = float(it["unit_price"])
        except (ValueError, TypeError, KeyError):
            raise ValueError(f"الكمية وسعر الوحدة للصنف '{it.get('description', idx)}' يجب أن تكون قيم عددية صالحة")
        
        if not math.isfinite(qty) or qty < 0:
            raise ValueError(f"الكمية للصنف '{it['description']}' يجب أن تكون أكبر من أو تساوي الصفر")
        if not math.isfinite(price) or price < 0:
            raise ValueError(f"سعر الوحدة للصنف '{it['description']}' يجب أن يكون أكبر من أو تساوي الصفر")
        
        tax_rate = float(it.get("tax_rate", default_tax))
        if not math.isfinite(tax_rate) or not (0 <= tax_rate <= 1):
            raise ValueError(f"نسبة الضريبة للصنف '{it['description']}' يجب أن تكون بين 0 و 1")
        
        invoice_items.append(
            InvoiceItem(
                description=str(it["description"]),
                quantity=qty,
                unit_price=price,
                tax_rate=tax_rate,
            )
        )
    invoice = Invoice(
        invoice_number=invoice_number,
        seller_name=seller_name,
        seller_vat=seller_vat,
        buyer_name=buyer_name,
        buyer_vat=buyer_vat,
        country=country,
        currency=currency,
        items=invoice_items,
        notes=notes,
    )
    decimals = CURRENCY_UNITS.get(currency, {}).get("decimals", 2)
    return {
        "invoice_number": invoice.invoice_number,
        "issue_date": invoice.issue_date,
        "seller": {"name": invoice.seller_name, "vat": invoice.seller_vat},
        "buyer": {"name": invoice.buyer_name, "vat": invoice.buyer_vat},
        "country": invoice.country,
        "currency": invoice.currency,
        "items": [
            {
                "description": i.description,
                "quantity": i.quantity,
                "unit_price": i.unit_price,
                "subtotal": round(i.quantity * i.unit_price, decimals),
                "tax_rate": i.tax_rate,
                "tax_amount": round(round(i.quantity * i.unit_price, decimals) * i.tax_rate, decimals),
                "total": round(round(i.quantity * i.unit_price, decimals) * (1 + i.tax_rate), decimals),
            }
            for i in invoice.items
        ],
        "subtotal": invoice.subtotal,
        "total_tax": invoice.total_tax,
        "total": invoice.total,
        "total_in_arabic_words": invoice.total_in_words,
        "notes": invoice.notes,
    }


@mcp.tool()
def format_invoice_arabic(invoice_data: Dict[str, Any]) -> str:
    """
    تنسيق بيانات الفاتورة كنص عربي جاهز للطباعة/الإرسال.

    Args:
        invoice_data: بيانات الفاتورة (مخرجات create_invoice)

    Returns:
        نص عربي منسق للفاتورة
    """
    lines = []
    lines.append("=" * 60)
    lines.append(f"              فاتورة ضريبية رقم: {invoice_data['invoice_number']}")
    lines.append("=" * 60)
    lines.append(f"التاريخ: {invoice_data['issue_date']}")
    lines.append(f"البائع: {invoice_data['seller']['name']}", )
    if invoice_data["seller"].get("vat"):
        lines.append(f"الرقم الضريبي للبائع: {invoice_data['seller']['vat']}")
    lines.append(f"المشتري: {invoice_data['buyer']['name']}")
    if invoice_data["buyer"].get("vat"):
        lines.append(f"الرقم الضريبي للمشتري: {invoice_data['buyer']['vat']}")
    lines.append("-" * 60)
    lines.append(f"{'الصنف':<30}{'الكمية':<10}{'السعر':<10}{'الإجمالي':<10}")
    lines.append("-" * 60)
    for item in invoice_data["items"]:
        lines.append(
            f"{item['description'][:30]:<30}"
            f"{item['quantity']:<10}"
            f"{item['unit_price']:<10}"
            f"{item['total']:<10}"
        )
    lines.append("-" * 60)
    lines.append(f"المجموع الفرعي: {invoice_data['subtotal']} {invoice_data['currency']}")
    lines.append(f"ضريبة القيمة المضافة: {invoice_data['total_tax']} {invoice_data['currency']}")
    lines.append("=" * 60)
    lines.append(f"الإجمالي: {invoice_data['total']} {invoice_data['currency']}")
    lines.append(f"الإجمالي بالكلمات: {invoice_data['total_in_arabic_words']}")
    if invoice_data.get("notes"):
        lines.append(f"ملاحظات: {invoice_data['notes']}")
    lines.append("=" * 60)
    return "\n".join(lines)


@mcp.tool()
def list_supported_currencies() -> Dict[str, Dict[str, str]]:
    """
    عرض جميع العملات العربية المدعومة مع تفاصيلها.

    Returns:
        قاموس بالعملات المدعومة (رمز -> تفاصيل)
    """
    return CURRENCY_UNITS


@mcp.tool()
def list_supported_vat_rates() -> Dict[str, Dict[str, Any]]:
    """
    عرض جميع معدلات ضريبة القيمة المضافة المدعومة حسب الدولة.

    Returns:
        قاموس بمعدلات VAT لكل دولة عربية
    """
    country_names = {
        "SA": "المملكة العربية السعودية", "EG": "مصر", "AE": "الإمارات العربية المتحدة",
        "BH": "البحرين", "KW": "الكويت", "QA": "قطر", "OM": "عُمان"
    }
    return {
        code: {
            "country_name": country_names[code],
            "vat_rate_percent": rate * 100,
            "vat_rate_decimal": rate,
        }
        for code, rate in VAT_RATES.items()
    }


@mcp.tool()
def generate_zatca_qr(
    seller_name: str,
    vat_number: str,
    timestamp: str,
    total_with_vat: float,
    vat_amount: float,
    output_image: Optional[str] = None,
) -> Dict[str, Any]:
    """
    توليد QR code للفاتورة الإلكترونية متوافق مع ZATCA السعودية (المرحلة الأولى B2C).

    يستخدم صيغة TLV (Tag-Length-Value) و Base64 encoding حسب المواصفات الرسمية.
    يحتاج الرقم الضريبي (15 رقم يبدأ بـ 3) و ISO 8601 timestamp.

    Args:
        seller_name: اسم البائع (Tag 1)
        vat_number: الرقم الضريبي للبائع — 15 رقم يبدأ بـ 3 (Tag 2)
        timestamp: تاريخ ووقت الفاتورة بصيغة ISO 8601 (مثال: "2026-07-04T15:30:00Z") (Tag 3)
        total_with_vat: الإجمالي شامل الضريبة (Tag 4)
        vat_amount: مبلغ الضريبة (Tag 5)
        output_image: مسار اختياري لحفظ صورة QR code (PNG). None = نص فقط.

    Returns:
        قاموس بـ base64_data (نص QR) + image_path (لو طُلب) + tlv_hex (للتdebug)

    Example:
        النتيجة: "Ak5vciDihqjih4..." (نص Base64 — حوله لـ QR)
    """
    if not ZATCA_AVAILABLE:
        raise ValueError(
            "ZATCA QR module not available. Install with: pip install arabic-invoice-mcp[qr] أو pip install qrcode[pil]"
        )
    if not isinstance(total_with_vat, (int, float)) or not math.isfinite(total_with_vat) or total_with_vat < 0:
        raise ValueError("الإجمالي شامل الضريبة يجب أن يكون قيمة عددية أكبر من أو تساوي الصفر")
    if not isinstance(vat_amount, (int, float)) or not math.isfinite(vat_amount) or vat_amount < 0:
        raise ValueError("مبلغ الضريبة يجب أن يكون قيمة عددية أكبر من أو تساوي الصفر")
    
    result = create_zatca_qr(
        seller_name=seller_name,
        vat_number=vat_number,
        timestamp=timestamp,
        total_with_vat=f"{total_with_vat:.2f}",
        vat_amount=f"{vat_amount:.2f}",
        output_image=output_image,
    )
    return {
        "base64_data": result.base64_data,
        "image_path": result.image_path,
        "tlv_hex": result.tlv_hex,
        "compliance": "ZATCA Phase 1 (B2C)",
        "instructions": "حوّل نص base64_data إلى QR code باستخدام أي مكتبة QR",
    }


@mcp.tool()
def hash_invoice_for_zatca(xml_content: str, algorithm: str = "sha256") -> Dict[str, str]:
    """
    حساب hash للفاتورة XML (مطلوب لـ ZATCA Phase 2 - B2B).

    Args:
        xml_content: محتوى الفاتورة XML
        algorithm: خوارزمية الـ hash — sha256, sha384, أو sha512

    Returns:
        قاموس بـ hash (hex) و algorithm و length
    """
    if not ZATCA_AVAILABLE:
        raise ValueError("ZATCA QR module not available")
    h = hash_invoice_xml(xml_content, algorithm)
    return {
        "hash": h,
        "algorithm": algorithm,
        "length": len(h),
        "note": "ZATCA Phase 2 requires sha256 of the canonicalized invoice XML",
    }


@mcp.tool()
def create_zatca_compliant_invoice(
    invoice_number: str,
    seller_name: str,
    seller_vat: str,
    buyer_name: str,
    items: List[Dict[str, Any]],
    country: str = "SA",
    currency: str = "SAR",
    buyer_vat: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    إنشاء فاتورة إلكترونية كاملة متوافق مع ZATCA — مع QR code مدمج.

    يجمع بين create_invoice و generate_zatca_qr في خطوة واحدة.

    Args:
        invoice_number: رقم الفاتورة (مثال: INV-2026-001)
        seller_name: اسم البائع
        seller_vat: الرقم الضريبي للبائع (15 رقم سعودي)
        buyer_name: اسم المشتري
        items: قائمة الأصناف [{description, quantity, unit_price, tax_rate?}]
        country: رمز الدولة (افتراضي SA)
        currency: رمز العملة (افتراضي SAR)
        buyer_vat: الرقم الضريبي للمشتري (اختياري)
        notes: ملاحظات إضافية

    Returns:
        قاموس شامل بكل بيانات الفاتورة + QR code (base64 + hex)

    Note:
        الـ timestamp بياخذ التاريخ الحالي تلقائياً (UTC ISO 8601).
        لو عايز تاريخ مخصص، استخدم generate_zatca_qr مع timestamp واضح.
    """
    # أولاً: إنشاء الفاتورة الأساسية
    invoice = create_invoice(
        invoice_number=invoice_number,
        seller_name=seller_name,
        buyer_name=buyer_name,
        items=items,
        country=country,
        currency=currency,
        seller_vat=seller_vat,
        buyer_vat=buyer_vat,
        notes=notes,
    )

    # ثانياً: توليد QR code (لو الدولة SA — باقي الدول مفيهاش ZATCA)
    if country == "SA":
        if not ZATCA_AVAILABLE:
            invoice["zatca_qr"] = {"error": "ZATCA module not installed"}
        else:
            try:
                timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                qr_result = create_zatca_qr(
                    seller_name=seller_name,
                    vat_number=seller_vat,
                    timestamp=timestamp,
                    total_with_vat=f"{invoice['total']:.2f}",
                    vat_amount=f"{invoice['total_tax']:.2f}",
                )
                invoice["zatca_qr"] = {
                    "base64_data": qr_result.base64_data,
                    "tlv_hex": qr_result.tlv_hex,
                    "compliance": "ZATCA Phase 1 (B2C)",
                    "timestamp": timestamp,
                    "instructions": "Convert base64_data to QR image and attach to invoice PDF",
                }
            except ValueError as e:
                invoice["zatca_qr"] = {"error": str(e)}
    else:
        invoice["zatca_qr"] = {
            "note": f"QR code خاص بـ ZATCA السعودية فقط (الدولة الحالية: {country})",
        }

    return invoice


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

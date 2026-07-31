"""
Saudi VAT Calculator Pro MCP Server
====================================
حاسبة ضريبة القيمة المضافة السعودية المتقدمة.

مميزات إضافية على النسخة الأساسية:
- حسابات معقدة (خصومات، استرداد، ضريبة صفرية)
- تاريخ سريان الضريبة (قبل/بعد 2018)
- ضريبة انتقائية (Excise Tax)
- حساب صافي الراتب (GOSI)
- تقارير مخصصة
"""

from mcp.server.fastmcp import FastMCP
from typing import Optional, Literal, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
import json

mcp = FastMCP("saudi-vat-pro")


# =============================================================================
# Constants
# =============================================================================

# VAT was introduced in Saudi Arabia on Jan 1, 2018 at 5%, raised to 15% on July 1, 2020
VAT_HISTORY = [
    {"from": "2018-01-01", "to": "2020-06-30", "rate": 0.05, "note": "تاريخ التطبيق الأول"},
    {"from": "2020-07-01", "to": None, "rate": 0.15, "note": "الزيادة لدعم الميزانية"},
]

# Excise tax rates
EXCISE_RATES = {
    "tobacco": 1.00,           # 100%
    "energy_drinks": 1.00,     # 100%
    "soft_drinks": 0.50,       # 50%
    "alcohol": 1.00,           # 100% (ممنوع لكن مدرج للتوثيق)
}

# GOSI rates (التأمينات الاجتماعية)
GOSI_RATES = {
    "employee_share": 0.0975,   # 9.75%
    "employer_share": 0.1175,   # 11.75% (شامل ساند، أخطار عمل)
    "total": 0.215,             # المجموع
}


# =============================================================================
# Core Functions
# =============================================================================

def get_vat_rate_for_date(date_str: str) -> Dict[str, Any]:
    """
    معرفة نسبة الضريبية السارية في تاريخ معين.

    Args:
        date_str: التاريخ بصيغة YYYY-MM-DD
    """
    try:
        date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return {"error": f"تاريخ غير صالح: {date_str}. الصيغة الصحيحة: YYYY-MM-DD"}

    for period in VAT_HISTORY:
        from_date = datetime.strptime(period["from"], "%Y-%m-%d").date()
        to_date = (
            datetime.strptime(period["to"], "%Y-%m-%d").date()
            if period["to"] else None
        )
        if date >= from_date and (to_date is None or date <= to_date):
            return {
                "date": date_str,
                "rate_percent": period["rate"] * 100,
                "rate_decimal": period["rate"],
                "period_note": period["note"],
            }
    # Before VAT introduction
    return {
        "date": date_str,
        "rate_percent": 0.0,
        "rate_decimal": 0.0,
        "period_note": "قبل تطبيق الضريبة (2018-01-01)",
    }


def calculate_excise_tax(
    product_type: Literal["tobacco", "energy_drinks", "soft_drinks", "alcohol"],
    price: float,
    quantity: int = 1,
) -> Dict[str, Any]:
    """
    حساب الضريبة الانتقائية (Excise Tax).

    Args:
        product_type: نوع المنتج
        price: سعر الوحدة
        quantity: الكمية
    """
    if product_type not in EXCISE_RATES:
        return {
            "error": f"نوع غير مدعوم: {product_type}",
            "supported": list(EXCISE_RATES.keys()),
        }

    rate = EXCISE_RATES[product_type]
    total_price = price * quantity
    excise = round(total_price * rate, 2)

    product_names = {
        "tobacco": "تبغ ومشتقاته",
        "energy_drinks": "مشروبات الطاقة",
        "soft_drinks": "المشروبات الغازية",
        "alcohol": "مشروبات كحولية",
    }

    return {
        "product_type": product_type,
        "product_name_ar": product_names[product_type],
        "unit_price": price,
        "quantity": quantity,
        "total_price_excise_excl": total_price,
        "excise_rate_percent": rate * 100,
        "excise_amount": excise,
        "total_price_incl_excise": round(total_price + excise, 2),
    }


def calculate_gosi(
    gross_salary: float,
    saudi_nationality: bool = True,
) -> Dict[str, Any]:
    """
    حساب استقطاع التأمينات الاجتماعية (GOSI) من الراتب.

    Args:
        gross_salary: الراتب الإجمالي (قبل الاستقطاع)
        saudi_nationality: هل الموظف سعودي؟ (غير السعوديين يدفعون نسبة مختلفة)
    """
    if gross_salary < 0:
        return {"error": "الراتب لا يمكن أن يكون سالباً"}

    # حسب نظام التأمينات: غير السعوديين يدفعون فقط تأمين أخطار عمل (2%)
    if saudi_nationality:
        employee_deduction = round(gross_salary * GOSI_RATES["employee_share"], 2)
    else:
        employee_deduction = round(gross_salary * 0.02, 2)  # أخطار عمل فقط

    net_salary = round(gross_salary - employee_deduction, 2)

    return {
        "gross_salary": gross_salary,
        "nationality": "سعودي" if saudi_nationality else "غير سعودي",
        "employee_gosi_deduction": employee_deduction,
        "net_salary": net_salary,
        "note": "خصم صاحب العمل (11.75%) على صاحب العمل ولا يظهر في صافي الراتب",
    }


def calculate_invoice_with_discount(
    items: List[Dict[str, Any]],
    discount_percent: float = 0.0,
    discount_before_vat: bool = True,
    vat_rate: float = 0.15,
) -> Dict[str, Any]:
    """
    فاتورة معقدة: أصناف متعددة + خصم + VAT.

    Args:
        items: [{description, quantity, unit_price, vat_rate?}, ...]
        discount_percent: نسبة الخصم (0-100)
        discount_before_vat: هل الخصم قبل الـ VAT (True) أم بعده (False)
        vat_rate: نسبة الضريبة (افتراضي 15%)
    """
    if not 0 <= discount_percent <= 100:
        return {"error": "نسبة الخصم يجب أن تكون بين 0 و 100"}

    # حساب subtotal
    line_totals = []
    for item in items:
        line_subtotal = item["quantity"] * item["unit_price"]
        item_vat_rate = item.get("vat_rate", vat_rate)
        line_totals.append({
            "description": item["description"],
            "quantity": item["quantity"],
            "unit_price": item["unit_price"],
            "subtotal": line_subtotal,
            "vat_rate": item_vat_rate,
        })

    subtotal = round(sum(lt["subtotal"] for lt in line_totals), 2)

    if discount_before_vat:
        discount_amount = round(subtotal * discount_percent / 100, 2)
        net_before_vat = round(subtotal - discount_amount, 2)
        vat_amount = round(net_before_vat * vat_rate, 2)
        total = round(net_before_vat + vat_amount, 2)
    else:
        vat_amount = round(subtotal * vat_rate, 2)
        total_before_discount = round(subtotal + vat_amount, 2)
        discount_amount = round(total_before_discount * discount_percent / 100, 2)
        total = round(total_before_discount - discount_amount, 2)
        net_before_vat = subtotal

    return {
        "items": line_totals,
        "subtotal": subtotal,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "discount_before_vat": discount_before_vat,
        "net_before_vat": net_before_vat,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "total_incl_vat": total,
    }


def calculate_reverse_charge(
    service_value: float,
    service_provider_country: str,
    service_recipient_country: str,
    recipient_vat_registered: bool,
) -> Dict[str, Any]:
    """
    حساب Reverse Charge Mechanism (نظام الدفع العكسي).

    مثال: شركة سعودية تشتري خدمة من شركة مصرية — الضريبة تدفع في السعودية (دولة المستلم).

    Args:
        service_value: قيمة الخدمة
        service_provider_country: الدولة المقدمة للخدمة
        service_recipient_country: الدولة المستلمة
        recipient_vat_registered: هل المستلم مسجل ضريبياً؟
    """
    if service_provider_country == service_recipient_country:
        return {
            "applies": False,
            "note": "Reverse charge ما ينطبقش على الخدمات المحلية — ضريبة عادية",
        }

    if not recipient_vat_registered:
        return {
            "applies": False,
            "note": "Reverse charge ما ينطبقش إلا على المسجلين ضريبياً",
        }

    # Reverse charge: المستلم يدفع الضريبة في بلده
    # نفترض الضريبة 15% كقيمة افتراضية (السعودية)
    vat_amount = round(service_value * 0.15, 2)

    return {
        "applies": True,
        "note": "Reverse charge: المستلم يدفع الضريبة في بلده عبر إقراره الضريبي",
        "service_value": service_value,
        "vat_in_recipient_country": vat_amount,
        "vat_in_provider_country": 0.0,
        "total_to_pay_provider": service_value,  # بدون VAT للمقدم
        "total_reported_by_recipient": service_value + vat_amount,
    }


# =============================================================================
# MCP Tools
# =============================================================================

@mcp.tool()
def saudi_vat_for_date(date: str) -> Dict[str, Any]:
    """
    معرفة نسبة الضريبة السارية في تاريخ معين في السعودية.

    Args:
        date: التاريخ بصيغة YYYY-MM-DD
    """
    return get_vat_rate_for_date(date)


@mcp.tool()
def calc_excise_tax(
    product_type: str,
    price: float,
    quantity: int = 1,
) -> Dict[str, Any]:
    """
    حساب الضريبة الانتقائية (Excise Tax) السعودية.

    Args:
        product_type: نوع المنتج (tobacco, energy_drinks, soft_drinks, alcohol)
        price: سعر الوحدة الواحدة بالريال
        quantity: الكمية (افتراضي 1)
    """
    return calculate_excise_tax(product_type, price, quantity)


@mcp.tool()
def calc_gosi_deduction(gross_salary: float, saudi: bool = True) -> Dict[str, Any]:
    """
    حساب استقطاع التأمينات الاجتماعية (GOSI) من الراتب.

    Args:
        gross_salary: الراتب الإجمالي قبل الخصم
        saudi: هل الموظف سعودي؟ (True/False)
    """
    return calculate_gosi(gross_salary, saudi_nationality=saudi)


@mcp.tool()
def invoice_with_discount(
    items: List[Dict[str, Any]],
    discount_percent: float = 0.0,
    discount_before_vat: bool = True,
    vat_rate: float = 0.15,
) -> Dict[str, Any]:
    """
    فاتورة متقدمة: أصناف متعددة + خصم + VAT.

    Args:
        items: قائمة الأصناف [{description, quantity, unit_price, vat_rate?}]
        discount_percent: نسبة الخصم (0-100)
        discount_before_vat: هل الخصم قبل VAT (افتراضي True)؟
        vat_rate: نسبة الضريبة (افتراضي 15%)
    """
    return calculate_invoice_with_discount(items, discount_percent, discount_before_vat, vat_rate)


@mcp.tool()
def reverse_charge_calc(
    service_value: float,
    provider_country: str,
    recipient_country: str,
    recipient_vat_registered: bool,
) -> Dict[str, Any]:
    """
    حساب Reverse Charge Mechanism (الدفع العكسي) للمعاملات الدولية.

    Args:
        service_value: قيمة الخدمة
        provider_country: الدولة المقدمة (SA, EG, AE, ...)
        recipient_country: الدولة المستلمة
        recipient_vat_registered: هل المستلم مسجل ضريبياً؟
    """
    return calculate_reverse_charge(
        service_value, provider_country, recipient_country, recipient_vat_registered,
    )


@mcp.tool()
def vat_period_summary(
    total_sales: float,
    total_purchases: float,
    exempt_sales: float = 0.0,
    zero_rated_sales: float = 0.0,
) -> Dict[str, Any]:
    """
    حساب ملخص فترة ضريبية (إقرار ضريبي مبسط).

    Args:
        total_sales: إجمالي المبيعات الخاضعة للضريبة
        total_purchases: إجمالي المشتريات الخاضعة للضريبة
        exempt_sales: مبيعات معفاة
        zero_rated_sales: مبيعات خاضعة لنسبة صفرية
    """
    VAT_RATE = 0.15
    output_vat = round(total_sales * VAT_RATE, 2)
    input_vat = round(total_purchases * VAT_RATE, 2)
    net_vat = round(output_vat - input_vat, 2)

    return {
        "period": datetime.now().strftime("%Y-%m"),
        "total_sales_taxable": total_sales,
        "total_purchases_taxable": total_purchases,
        "exempt_sales": exempt_sales,
        "zero_rated_sales": zero_rated_sales,
        "output_vat_15": output_vat,
        "input_vat_15": input_vat,
        "net_vat_payable": net_vat,
        "note": (
            "ضريبة مستحقة للدفع" if net_vat > 0
            else "ضريبة قابلة للاسترداد (طلب استرداد من ZATCA)"
        ),
    }


if __name__ == "__main__":
    mcp.run()
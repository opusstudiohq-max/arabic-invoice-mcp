"""
Arabic Date Converter MCP Server
================================
خادم MCP للتحويل بين التواريخ الهجرية والميلادية مع دعم شامل.

المميزات:
- تحويل هجري ↔ ميلادي (Umm al-Qura calendar، المعتمد رسمياً في السعودية)
- تنسيق التواريخ بالعربية
- حساب العمر
- حساب أيام العمل
- تقويم الزكاة (رمضان، الأعياد)
- توليد ISO 8601 timestamps مع التاريخ الهجري (متوافق مع ZATCA)
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from typing import Optional, Dict, Any, List, Tuple
from datetime import date, datetime, timedelta
from hijridate import Hijri, Gregorian
import calendar

mcp = FastMCP("arabic-date-converter")


# =============================================================================
# Constants
# =============================================================================

ARABIC_MONTHS_GREGORIAN = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]

ARABIC_MONTHS_HIJRI = [
    "محرم",          # 1
    "صفر",           # 2
    "ربيع الأول",    # 3
    "ربيع الآخر",    # 4
    "جمادى الأولى",  # 5
    "جمادى الآخرة",  # 6
    "رجب",           # 7
    "شعبان",         # 8
    "رمضان",         # 9
    "شوال",          # 10
    "ذو القعدة",     # 11
    "ذو الحجة",      # 12
]

ARABIC_DAYS = [
    "الإثنين", "الثلاثاء", "الأربعاء", "الخميس",
    "الجمعة", "السبت", "الأحد"
]

# Saudi weekend: Friday + Saturday
SAUDI_WEEKEND_DAYS = {4, 5}  # Friday=4, Saturday=5 (using Python weekday: Mon=0)


# =============================================================================
# Core Conversion Functions
# =============================================================================

def gregorian_to_hijri(
    year: int, month: int, day: int
) -> Dict[str, Any]:
    """
    تحويل من ميلادي إلى هجري.

    Args:
        year: السنة الميلادية (e.g., 2026)
        month: الشهر الميلادي (1-12)
        day: اليوم (1-31)

    Returns:
        قاموس بالتاريخ الهجري بصيغ مختلفة
    """
    try:
        g = Gregorian(year, month, day)
        h = g.to_hijri()
    except (ValueError, TypeError) as e:
        return {"error": f"تاريخ ميلادي غير صالح: {e}"}

    return {
        "hijri_year": h.year,
        "hijri_month": h.month,
        "hijri_day": h.day,
        "hijri_formatted": f"{h.year:04d}-{h.month:02d}-{h.day:02d}",
        "hijri_arabic_long": _format_hijri_arabic_long(h.year, h.month, h.day),
        "gregorian_input": f"{year:04d}-{month:02d}-{day:02d}",
        "calendar": "Umm al-Qura (Saudi official)",
    }


def hijri_to_gregorian(
    year: int, month: int, day: int
) -> Dict[str, Any]:
    """
    تحويل من هجري إلى ميلادي.

    Args:
        year: السنة الهجرية (e.g., 1447)
        month: الشهر الهجري (1-12)
        day: اليوم (1-29/30)

    Returns:
        قاموس بالتاريخ الميلادي بصيغ مختلفة
    """
    try:
        h = Hijri(year, month, day)
        g = h.to_gregorian()
    except (ValueError, TypeError) as e:
        return {"error": f"تاريخ هجري غير صالح: {e}"}

    return {
        "gregorian_year": g.year,
        "gregorian_month": g.month,
        "gregorian_day": g.day,
        "gregorian_formatted": g.isoformat(),
        "gregorian_arabic_long": _format_gregorian_arabic_long(g.year, g.month, g.day),
        "hijri_input": f"{year:04d}-{month:02d}-{day:02d}",
        "weekday_ar": ARABIC_DAYS[g.weekday()],
        "calendar": "Umm al-Qura (Saudi official)",
    }


def current_hijri_date() -> Dict[str, Any]:
    """
    التاريخ الهجري اليوم.

    Returns:
        التاريخ الهجري الحالي + الميلادي + أيام الأسبوع
    """
    today_g = Gregorian.today()
    today_h = today_g.to_hijri()

    return {
        "hijri_date": {
            "year": today_h.year,
            "month": today_h.month,
            "day": today_h.day,
            "formatted": f"{today_h.year:04d}-{today_h.month:02d}-{today_h.day:02d}",
            "month_name_ar": ARABIC_MONTHS_HIJRI[today_h.month - 1],
        },
        "gregorian_date": {
            "year": today_g.year,
            "month": today_g.month,
            "day": today_g.day,
            "formatted": today_g.isoformat(),
            "month_name_ar": ARABIC_MONTHS_GREGORIAN[today_g.month - 1],
        },
        "weekday_ar": ARABIC_DAYS[today_g.weekday()],
        "full_arabic": _format_hijri_arabic_long(
            today_h.year, today_h.month, today_h.day
        ),
    }


# =============================================================================
# Formatting Helpers
# =============================================================================

def _format_hijri_arabic_long(year: int, month: int, day: int) -> str:
    """تنسيق التاريخ الهجري بالعربي الفصيح: 'التاسع عشر من محرم سنة 1447 هـ'"""
    day_ar = _arabic_ordinal(day)
    month_ar = ARABIC_MONTHS_HIJRI[month - 1]
    return f"{day_ar} من {month_ar} سنة {year} هـ"


def _format_gregorian_arabic_long(year: int, month: int, day: int) -> str:
    """تنسيق التاريخ الميلادي بالعربي: 'الرابع من يوليو سنة 2026 م'"""
    day_ar = _arabic_ordinal(day)
    month_ar = ARABIC_MONTHS_GREGORIAN[month - 1]
    return f"{day_ar} من {month_ar} سنة {year} م"


def _arabic_ordinal(n: int) -> str:
    """تحويل رقم إلى ترتيبي عربي: 1 → الأول، 2 → الثاني، إلخ"""
    ordinals = {
        1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع", 5: "الخامس",
        6: "السادس", 7: "السابع", 8: "الثامن", 9: "التاسع", 10: "العاشر",
        11: "الحادي عشر", 12: "الثاني عشر", 13: "الثالث عشر",
        14: "الرابع عشر", 15: "الخامس عشر", 16: "السادس عشر",
        17: "السابع عشر", 18: "الثامن عشر", 19: "التاسع عشر",
        20: "العشرون", 21: "الحادي والعشرون", 22: "الثاني والعشرون",
        23: "الثالث والعشرون", 24: "الرابع والعشرون", 25: "الخامس والعشرون",
        26: "السادس والعشرون", 27: "السابع والعشرون", 28: "الثامن والعشرون",
        29: "التاسع والعشرون", 30: "الثلاثون", 31: "الحادي والثلاثون",
    }
    return ordinals.get(n, str(n))


# =============================================================================
# Age & Business Days
# =============================================================================

def calculate_age_hijri(birth_date_gregorian: str) -> Dict[str, Any]:
    """
    حساب العمر بالتاريخ الهجري والميلادي.

    Args:
        birth_date_gregorian: تاريخ الميلاد بصيغة YYYY-MM-DD (ميلادي)
    """
    try:
        birth_g = date.fromisoformat(birth_date_gregorian)
    except ValueError:
        return {"error": f"تاريخ غير صالح: {birth_date_gregorian}. الصيغة الصحيحة: YYYY-MM-DD"}

    today = date.today()
    birth_h = Gregorian(birth_g.year, birth_g.month, birth_g.day).to_hijri()
    today_h = Gregorian(today.year, today.month, today.day).to_hijri()

    # Age in years (gregorian)
    age_g_years = today.year - birth_g.year
    if (today.month, today.day) < (birth_g.month, birth_g.day):
        age_g_years -= 1

    # Age in years (hijri)
    age_h_years = today_h.year - birth_h.year
    if (today_h.month, today_h.day) < (birth_h.month, birth_h.day):
        age_h_years -= 1

    # Total days
    total_days = (today - birth_g).days

    return {
        "birth_date_gregorian": birth_date_gregorian,
        "birth_date_hijri": f"{birth_h.year:04d}-{birth_h.month:02d}-{birth_h.day:02d}",
        "age_gregorian_years": age_g_years,
        "age_hijri_years": age_h_years,
        "total_days": total_days,
        "total_weeks": total_days // 7,
        "total_months": total_days // 30,
    }


def business_days_between(
    start_date: str,
    end_date: str,
    saudi_weekend: bool = True,
) -> Dict[str, Any]:
    """
    حساب أيام العمل بين تاريخين.

    Args:
        start_date: تاريخ البداية YYYY-MM-DD
        end_date: تاريخ النهاية YYYY-MM-DD
        saudi_weekend: استبعاد الجمعة والسبت (عطلة نهاية الأسبوع في السعودية)
    """
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError as e:
        return {"error": f"تاريخ غير صالح: {e}. الصيغة: YYYY-MM-DD"}

    if end < start:
        return {"error": "تاريخ النهاية لازم يكون بعد البداية"}

    total_days = (end - start).days + 1  # Inclusive
    business_days = 0
    weekend_days = 0

    current = start
    while current <= end:
        weekday = current.weekday()
        if saudi_weekend and weekday in SAUDI_WEEKEND_DAYS:
            weekend_days += 1
        elif not saudi_weekend and weekday >= 5:  # Sat+Sun
            weekend_days += 1
        else:
            business_days += 1
        current += timedelta(days=1)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_days": total_days,
        "business_days": business_days,
        "weekend_days": weekend_days,
        "calendar": "Saudi weekend (Fri+Sat)" if saudi_weekend else "Western weekend (Sat+Sun)",
    }


# =============================================================================
# ZATCA Integration
# =============================================================================

def iso_to_hijri_datetime(iso_timestamp: str) -> Dict[str, Any]:
    """
    تحويل ISO 8601 timestamp إلى التاريخ الهجري.
    مفيد لتكامل ZATCA (يستخدم ISO 8601 + Hijri للـ audits).

    Args:
        iso_timestamp: ISO 8601 timestamp (e.g., "2026-07-04T15:30:00Z")
    """
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError as e:
        return {"error": f"ISO timestamp غير صالح: {e}. مثال: 2026-07-04T15:30:00Z"}

    g = Gregorian(dt.year, dt.month, dt.day)
    h = g.to_hijri()

    return {
        "iso_input": iso_timestamp,
        "gregorian": f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}",
        "hijri": f"{h.year:04d}-{h.month:02d}-{h.day:02d}",
        "hijri_arabic": _format_hijri_arabic_long(h.year, h.month, h.day),
        "time": f"{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}",
        "weekday_ar": ARABIC_DAYS[dt.weekday()],
        "use_case": "ZATCA invoice timestamps + Saudi legal documents",
    }


# =============================================================================
# Zakat Calendar (Islamic events)
# =============================================================================

def upcoming_islamic_events(year_gregorian: int, count: int = 5) -> List[Dict[str, Any]]:
    """
    الأحداث الإسلامية القادمة (رمضان، الأعياد).

    Args:
        year_gregorian: السنة الميلادية
        count: عدد الأحداث المطلوبة
    """
    # Calculate the corresponding Hijri year for this Gregorian year
    # (rough: Hijri year ≈ Gregorian year - 622, with adjustment)
    try:
        g_mid = Gregorian(year_gregorian, 6, 15)
        h_mid = g_mid.to_hijri()
        hijri_year_base = h_mid.year
    except (ValueError, TypeError):
        hijri_year_base = year_gregorian - 622

    events = [
        # (Hijri month, day, name_ar, name_en, description)
        (1, 1, "رأس السنة الهجرية", "Islamic New Year", "بداية السنة الهجرية الجديدة"),
        (3, 12, "المولد النبوي", "Prophet's Birthday", "ذكرى مولد النبي محمد ﷺ"),
        (7, 27, "ليلة المعراج", "Isra and Mi'raj", "ذكرى رحلة الإسراء والمعراج"),
        (8, 15, "النصف من شعبان", "Mid-Shaban", "ليلة منتصف شعبان"),
        (9, 1, "بداية رمضان", "Start of Ramadan", "أول أيام شهر رمضان المبارك"),
        (9, 27, "ليلة القدر", "Laylat al-Qadr", "ليلة القدر (الأفضل في رمضان)"),
        (10, 1, "عيد الفطر", "Eid al-Fitr", "عيد الفطر (أول 3 أيام)"),
        (12, 9, "يوم عرفة", "Day of Arafah", "يوم عرفة (الحج)"),
        (12, 10, "عيد الأضحى", "Eid al-Adha", "عيد الأضحى المبارك"),
    ]

    results = []
    # Search across 2 hijri years to catch events at year boundaries
    for hijri_offset in [0, 1]:
        for h_month, h_day, name_ar, name_en, desc in events:
            try:
                h_year_try = hijri_year_base + hijri_offset
                h = Hijri(h_year_try, h_month, h_day)
                g = h.to_gregorian()
                g_date = date(g.year, g.month, g.day)

                # Only include events in or near the requested Gregorian year
                if abs((g_date - date(year_gregorian, 6, 30)).days) < 365:
                    results.append({
                        "event_name_ar": name_ar,
                        "event_name_en": name_en,
                        "description": desc,
                        "hijri_date": f"{h_year_try:04d}-{h_month:02d}-{h_day:02d}",
                        "gregorian_date": g_date.isoformat(),
                        "hijri_arabic": _format_hijri_arabic_long(h_year_try, h_month, h_day),
                        "days_until": (g_date - date.today()).days,
                    })
            except (ValueError, TypeError):
                continue

    # Deduplicate (same event name might appear twice)
    seen = set()
    unique = []
    for r in results:
        key = (r["event_name_ar"], r["gregorian_date"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    # Sort by upcoming
    unique.sort(key=lambda x: x["days_until"])

    return unique[:count]


# =============================================================================
# MCP Tools
# =============================================================================

@mcp.tool()
def convert_gregorian_to_hijri(year: int, month: int, day: int) -> Dict[str, Any]:
    """
    تحويل من ميلادي إلى هجري.

    Args:
        year: السنة الميلادية (e.g., 2026)
        month: الشهر (1-12)
        day: اليوم (1-31)
    """
    return gregorian_to_hijri(year, month, day)


@mcp.tool()
def convert_hijri_to_gregorian(year: int, month: int, day: int) -> Dict[str, Any]:
    """
    تحويل من هجري إلى ميلادي.

    Args:
        year: السنة الهجرية (e.g., 1447)
        month: الشهر الهجري (1-12)
        day: اليوم (1-29/30)
    """
    return hijri_to_gregorian(year, month, day)


@mcp.tool()
def get_current_hijri_date() -> Dict[str, Any]:
    """
    التاريخ الهجري اليوم مع الميلادي.
    """
    return current_hijri_date()


@mcp.tool()
def format_date_arabic(
    year: int, month: int, day: int, calendar: str = "hijri"
) -> str:
    """
    تنسيق التاريخ بالعربي الفصيح.

    Args:
        year: السنة
        month: الشهر
        day: اليوم
        calendar: 'hijri' أو 'gregorian'
    """
    if calendar == "hijri":
        return _format_hijri_arabic_long(year, month, day)
    else:
        return _format_gregorian_arabic_long(year, month, day)


@mcp.tool()
def calculate_age(birth_date: str) -> Dict[str, Any]:
    """
    حساب العمر بالتاريخين الهجري والميلادي.

    Args:
        birth_date: تاريخ الميلاد بصيغة YYYY-MM-DD (ميلادي)
    """
    return calculate_age_hijri(birth_date)


@mcp.tool()
def count_business_days(
    start_date: str, end_date: str, saudi_weekend: bool = True
) -> Dict[str, Any]:
    """
    حساب أيام العمل بين تاريخين (يستبعد عطلة نهاية الأسبوع).

    Args:
        start_date: تاريخ البداية YYYY-MM-DD
        end_date: تاريخ النهاية YYYY-MM-DD
        saudi_weekend: True = الجمعة+السبت (افتراضي)، False = السبت+الأحد
    """
    return business_days_between(start_date, end_date, saudi_weekend)


@mcp.tool()
def iso_to_hijri(iso_timestamp: str) -> Dict[str, Any]:
    """
    تحويل ISO 8601 timestamp إلى التاريخ الهجري.
    مفيد لتكامل ZATCA والفواتير الإلكترونية.

    Args:
        iso_timestamp: مثال: "2026-07-04T15:30:00Z"
    """
    return iso_to_hijri_datetime(iso_timestamp)


@mcp.tool()
def islamic_calendar_events(year: int = 2026, count: int = 5) -> List[Dict[str, Any]]:
    """
    الأحداث الإسلامية القادمة (رمضان، الأعياد، المناسبات الدينية).

    Args:
        year: السنة الميلادية
        count: عدد الأحداث المطلوبة
    """
    return upcoming_islamic_events(year, count)


@mcp.tool()
def hijri_month_name(month: int) -> str:
    """
    اسم الشهر الهجري بالعربي.

    Args:
        month: رقم الشهر الهجري (1-12)
    """
    if not 1 <= month <= 12:
        return f"شهر غير صالح: {month}. لازم يكون بين 1 و 12"
    return ARABIC_MONTHS_HIJRI[month - 1]


if __name__ == "__main__":
    mcp.run()
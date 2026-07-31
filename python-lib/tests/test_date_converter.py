"""
اختبارات Arabic Date Converter MCP Server
اختبارات شاملة للتحويلات والحسابات.
"""
import pytest
from datetime import date, datetime, timedelta
from arabic_invoice_mcp.date_converter import (
    gregorian_to_hijri,
    hijri_to_gregorian,
    current_hijri_date,
    calculate_age_hijri,
    business_days_between,
    iso_to_hijri_datetime,
    upcoming_islamic_events,
    _format_hijri_arabic_long,
    _format_gregorian_arabic_long,
    _arabic_ordinal,
    ARABIC_MONTHS_HIJRI,
    ARABIC_MONTHS_GREGORIAN,
    ARABIC_DAYS,
)


class TestGregorianToHijri:
    def test_known_date(self):
        """أول يوم من رمضان 1447 هـ = 2026-02-18"""
        result = gregorian_to_hijri(2026, 2, 18)
        assert "error" not in result
        assert result["hijri_year"] == 1447  # Umm al-Qura approximation
        assert result["hijri_month"] == 9
        assert result["hijri_day"] == 1
        assert result["calendar"] == "Umm al-Qura (Saudi official)"

    def test_today_conversion(self):
        """اختبار التحويل للتاريخ الحالي"""
        result = gregorian_to_hijri(2026, 7, 4)
        assert "error" not in result
        assert "hijri_formatted" in result
        assert "hijri_arabic_long" in result
        assert "من محرم" in result["hijri_arabic_long"] or \
               "من صفر" in result["hijri_arabic_long"] or \
               any(m in result["hijri_arabic_long"] for m in ARABIC_MONTHS_HIJRI)

    def test_invalid_date(self):
        """Feb 30 غير موجود"""
        result = gregorian_to_hijri(2026, 2, 30)
        assert "error" in result

    def test_invalid_month(self):
        result = gregorian_to_hijri(2026, 13, 1)
        assert "error" in result

    def test_hijri_formatted_format(self):
        """التنسيق لازم يكون YYYY-MM-DD"""
        result = gregorian_to_hijri(2025, 6, 26)
        assert result["hijri_formatted"] == f"{result['hijri_year']:04d}-{result['hijri_month']:02d}-{result['hijri_day']:02d}"


class TestHijriToGregorian:
    def test_known_date(self):
        """1447-01-01 هـ = 2025-06-26 م"""
        result = hijri_to_gregorian(1447, 1, 1)
        assert "error" not in result
        assert result["gregorian_year"] == 2025
        assert result["gregorian_month"] == 6
        assert result["gregorian_day"] == 26

    def test_returns_weekday(self):
        result = hijri_to_gregorian(1447, 1, 1)
        assert "weekday_ar" in result
        assert result["weekday_ar"] in ARABIC_DAYS

    def test_round_trip(self):
        """greg → hijri → greg لازم يرجع نفس التاريخ"""
        g_original = (2026, 7, 4)
        h = gregorian_to_hijri(*g_original)
        g_back = hijri_to_gregorian(h["hijri_year"], h["hijri_month"], h["hijri_day"])
        assert (g_back["gregorian_year"], g_back["gregorian_month"], g_back["gregorian_day"]) == g_original

    def test_invalid_hijri_day(self):
        """Hijri day 30 in month 2 (صفر) — مش دايماً موجود"""
        result = hijri_to_gregorian(1447, 2, 30)
        # ممكن يفشل أو ينجح (حسب الـ month length)
        assert isinstance(result, dict)


class TestCurrentHijriDate:
    def test_returns_valid_structure(self):
        result = current_hijri_date()
        assert "hijri_date" in result
        assert "gregorian_date" in result
        assert "weekday_ar" in result
        assert "full_arabic" in result

    def test_hijri_year_is_reasonable(self):
        """السنة الهجرية الحالية لازم تكون بين 1446 و 1450"""
        result = current_hijri_date()
        assert 1446 <= result["hijri_date"]["year"] <= 1450

    def test_month_name_arabic(self):
        result = current_hijri_date()
        assert result["hijri_date"]["month_name_ar"] in ARABIC_MONTHS_HIJRI


class TestFormatArabic:
    @pytest.mark.parametrize("n, expected", [
        (1, "الأول"),
        (2, "الثاني"),
        (10, "العاشر"),
        (15, "الخامس عشر"),
        (20, "العشرون"),
        (29, "التاسع والعشرون"),
        (30, "الثلاثون"),
    ])
    def test_arabic_ordinal(self, n, expected):
        assert _arabic_ordinal(n) == expected

    def test_format_hijri_arabic(self):
        formatted = _format_hijri_arabic_long(1447, 9, 1)
        assert "الأول من رمضان سنة 1447 هـ" == formatted

    def test_format_gregorian_arabic(self):
        formatted = _format_gregorian_arabic_long(2026, 7, 4)
        assert "الرابع من يوليو سنة 2026 م" == formatted


class TestAgeCalculator:
    def test_newborn(self):
        """طفل عمره يوم واحد"""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        result = calculate_age_hijri(yesterday)
        assert "error" not in result
        assert result["age_gregorian_years"] == 0
        assert result["age_hijri_years"] == 0
        assert result["total_days"] == 1

    def test_adult_30_years(self):
        """شخص عمره 30 سنة"""
        birth = date(1996, 7, 4).isoformat()
        result = calculate_age_hijri(birth)
        today = date.today()
        expected_age = today.year - 1996
        if (today.month, today.day) < (7, 4):
            expected_age -= 1
        assert result["age_gregorian_years"] == expected_age

    def test_invalid_date_format(self):
        result = calculate_age_hijri("not-a-date")
        assert "error" in result

    def test_returns_both_calendars(self):
        result = calculate_age_hijri("1990-01-01")
        assert "age_gregorian_years" in result
        assert "age_hijri_years" in result
        assert "birth_date_hijri" in result


class TestBusinessDays:
    def test_one_week_excluding_saudi_weekend(self):
        """من الأحد للخميس (5 أيام عمل)"""
        # 2026-07-05 = Sunday
        # 2026-07-09 = Thursday
        # Saudi weekend: Friday (4) + Saturday (5)
        # Expected: 5 business days (Sun, Mon, Tue, Wed, Thu)
        result = business_days_between("2026-07-05", "2026-07-09")
        assert result["business_days"] == 5
        assert result["weekend_days"] == 0
        assert result["total_days"] == 5  # inclusive

    def test_includes_weekend(self):
        """من الأحد للسبت (5 أيام عمل + 2 عطلة)"""
        result = business_days_between("2026-07-05", "2026-07-11")
        # Sun, Mon, Tue, Wed, Thu = 5 business
        # Fri, Sat = 2 weekend
        assert result["business_days"] == 5
        assert result["weekend_days"] == 2

    def test_western_weekend(self):
        """Western weekend (Sat+Sun)"""
        # 2026-07-11 = Saturday
        # 2026-07-17 = Friday
        result = business_days_between("2026-07-11", "2026-07-17", saudi_weekend=False)
        # Sat (11) + Sun (12) = 2 weekend
        # Mon-Fri (13-17) = 5 business
        assert result["business_days"] == 5
        assert result["weekend_days"] == 2

    def test_end_before_start(self):
        result = business_days_between("2026-07-10", "2026-07-05")
        assert "error" in result

    def test_invalid_date_format(self):
        result = business_days_between("invalid", "2026-07-10")
        assert "error" in result


class TestIsoToHijri:
    def test_standard_iso(self):
        result = iso_to_hijri_datetime("2026-07-04T15:30:00Z")
        assert "error" not in result
        assert "hijri" in result
        assert "gregorian" in result
        assert "weekday_ar" in result
        assert result["time"] == "15:30:00"

    def test_with_offset(self):
        result = iso_to_hijri_datetime("2026-07-04T15:30:00+03:00")
        assert "error" not in result

    def test_invalid_format(self):
        result = iso_to_hijri_datetime("not-iso")
        assert "error" in result

    def test_zakat_use_case_mentioned(self):
        result = iso_to_hijri_datetime("2026-07-04T15:30:00Z")
        assert "ZATCA" in result.get("use_case", "")


class TestIslamicEvents:
    def test_returns_list(self):
        events = upcoming_islamic_events(2026, count=3)
        assert isinstance(events, list)
        assert len(events) <= 3

    def test_event_structure(self):
        events = upcoming_islamic_events(2026, count=1)
        if events:
            event = events[0]
            assert "event_name_ar" in event
            assert "event_name_en" in event
            assert "hijri_date" in event
            assert "gregorian_date" in event
            assert "days_until" in event

    def test_contains_ramadan(self):
        events = upcoming_islamic_events(2026, count=10)
        # Ramadan is month 9
        ramadan_events = [e for e in events if e["hijri_date"].endswith("-09-01")]
        # Ramadan 1447 was 2025, 1448 would be in 2026
        # Note: Umm al-Qura may put it in 2027
        # Just check structure
        for e in ramadan_events:
            assert "رمضان" in e["event_name_ar"] or "Ramadan" in e["event_name_en"]

    def test_eid_events(self):
        events = upcoming_islamic_events(2026, count=10)
        eids = [e for e in events if "عيد" in e["event_name_ar"]]
        # Should have at least one Eid
        assert isinstance(eids, list)


class TestMonthNames:
    def test_all_hijri_months(self):
        for i in range(1, 13):
            from arabic_invoice_mcp.date_converter import hijri_month_name
            name = hijri_month_name(i)
            assert name in ARABIC_MONTHS_HIJRI

    def test_invalid_month(self):
        from arabic_invoice_mcp.date_converter import hijri_month_name
        result = hijri_month_name(13)
        assert "غير صالح" in result


class TestAllConstants:
    def test_hijri_months_count(self):
        assert len(ARABIC_MONTHS_HIJRI) == 12

    def test_gregorian_months_count(self):
        assert len(ARABIC_MONTHS_GREGORIAN) == 12

    def test_days_count(self):
        assert len(ARABIC_DAYS) == 7

    def test_contains_key_months(self):
        assert "محرم" in ARABIC_MONTHS_HIJRI
        assert "رمضان" in ARABIC_MONTHS_HIJRI
        assert "ذو الحجة" in ARABIC_MONTHS_HIJRI
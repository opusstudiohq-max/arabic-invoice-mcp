"""
مُحقِّق محلي لمستندات الفاتورة الإلكترونية المصرية — يمنع الرفض قبل الإرسال.

**لماذا يوجد:** الشكوى الموثّقة في مجتمع المطورين ليست أن الفواتير تُرفض
فحسب، بل أن **الرفض بلا تشخيص**: «واحدة من كل ثلاث فواتير تُرفض بأخطاء
تقريب» و«لا سجلات تكشف السبب» و«غير واضح أقُبلت أم رُفضت أم قُبلت بتحفظ».
فقيمة هذا المُحقِّق في **الرسالة** بقدر ما هي في الكشف.

### مبدأ حاكم: لا نرفض ما لا نملك دليلاً على خطئه

كل قاعدة هنا **مشتقّة من العيّنة الرسمية** المنشورة على بوابة الهيئة
(`fixtures/one-doc.json`) ومُختبَرة عليها. وما لم نستطع اشتقاقه **مذكور
صراحةً في `UNRESOLVED` ولا يُفحص** — لأن مُحقِّقاً يرفض فاتورة صحيحة أسوأ
من مُحقِّق يفحص أقل: الأول يُفقد الثقة فيُهمَل، والثاني يبقى نافعاً.

### التقريب

المبالغ تُقارَن بـ`Decimal` لا بـ`float`. مقارنة المال بالعائم هي مصدر
«أخطاء التقريب» بعينها: `0.1 + 0.2 != 0.3`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

__all__ = ["Finding", "validate_document", "UNRESOLVED"]


UNRESOLVED: dict[str, str] = {
    "line.total": (
        "معادلة `invoiceLines[].total` لم تُشتقّ بعد. جُرّبت "
        "netTotal + valueDifference + totalTaxableFees ± الضرائب − itemsDiscount "
        "على العيّنة الرسمية فأعطت فرقاً مقداره 912.00 في البند الأول، "
        "و«نصف قرش» غير قابل للتمثيل في البند الثاني — أي أن الخلل في الصيغة "
        "لا في قطبية أنواع الضرائب. لا تُفحص حتى تُحسم من مواصفة الهيئة."
    ),
}


@dataclass
class Finding:
    """ملاحظة واحدة — بموضعها وسببها وما يُصلحها."""

    severity: str          # "خطأ" يمنع القبول • "تنبيه" قد يمرّ
    path: str              # موضعها في المستند
    message: str           # ما الخطأ
    expected: str = ""     # ما كان يجب أن يكون
    actual: str = ""       # ما هو كائن
    fix: str = ""          # كيف يُصلَح

    def __str__(self) -> str:
        parts = [f"[{self.severity}] {self.path}: {self.message}"]
        if self.expected or self.actual:
            parts.append(f"    المتوقَّع: {self.expected}    الموجود: {self.actual}")
        if self.fix:
            parts.append(f"    الإصلاح: {self.fix}")
        return "\n".join(parts)


def _dec(value: Any) -> Decimal | None:
    """تحويل آمن إلى Decimal عبر النص — لا عبر float."""
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _sum(values) -> Decimal:
    total = Decimal(0)
    for v in values:
        d = _dec(v)
        if d is not None:
            total += d
    return total


def _check_equal(out: list[Finding], path: str, label: str,
                 computed: Decimal, stated: Any, fix: str) -> None:
    """مقارنة مبلغ محسوب بمُعلَن — والفارق يُذكر لأنه أنفع من «غير مطابق»."""
    got = _dec(stated)
    if got is None:
        out.append(Finding("خطأ", path, f"{label} مفقود أو ليس رقماً",
                           expected="قيمة عددية", actual=repr(stated), fix=fix))
        return
    if computed != got:
        out.append(Finding(
            "خطأ", path, f"{label} لا يطابق المحسوب من مكوّناته",
            expected=str(computed), actual=str(got),
            fix=f"{fix} (الفارق {got - computed})",
        ))


def validate_document(doc: dict) -> list[Finding]:
    """
    فحص مستند فاتورة واحد. يرجع قائمة ملاحظات — فارغة تعني سليماً بحدود
    ما نستطيع إثباته.

    القواعد السبع المؤكَّدة على العيّنة الرسمية:
      1. لكل بند: salesTotal = quantity × unitValue.amountEGP
      2. لكل بند: netTotal   = salesTotal − discount.amount
      3. totalSalesAmount         = Σ salesTotal
      4. totalDiscountAmount      = Σ discount.amount
      5. netAmount                = totalSalesAmount − totalDiscountAmount
      6. totalItemsDiscountAmount = Σ itemsDiscount
      7. taxTotals[type]          = Σ taxableItems لكل نوع
      8. totalAmount              = Σ line.total − extraDiscountAmount
    """
    out: list[Finding] = []
    lines = doc.get("invoiceLines")

    if not isinstance(lines, list) or not lines:
        out.append(Finding(
            "خطأ", "invoiceLines", "المستند بلا بنود",
            expected="مصفوفة بها بند واحد على الأقل", actual=repr(lines),
            fix="أضف بنداً واحداً على الأقل",
        ))
        return out

    # ── على مستوى البند ──
    for i, line in enumerate(lines):
        p = f"invoiceLines[{i}]"
        if not isinstance(line, dict):
            out.append(Finding("خطأ", p, "البند ليس كائناً",
                               expected="كائن", actual=type(line).__name__))
            continue

        qty = _dec(line.get("quantity"))
        unit = _dec((line.get("unitValue") or {}).get("amountEGP"))
        if qty is not None and unit is not None:
            _check_equal(out, f"{p}.salesTotal", "إجمالي البيع",
                         qty * unit, line.get("salesTotal"),
                         "salesTotal = quantity × unitValue.amountEGP")

        sales = _dec(line.get("salesTotal"))
        disc = _dec((line.get("discount") or {}).get("amount")) or Decimal(0)
        if sales is not None:
            _check_equal(out, f"{p}.netTotal", "الصافي",
                         sales - disc, line.get("netTotal"),
                         "netTotal = salesTotal − discount.amount")

    # ── على مستوى المستند ──
    _check_equal(out, "totalSalesAmount", "إجمالي المبيعات",
                 _sum(l.get("salesTotal") for l in lines if isinstance(l, dict)),
                 doc.get("totalSalesAmount"),
                 "totalSalesAmount = مجموع salesTotal لكل البنود")

    _check_equal(out, "totalDiscountAmount", "إجمالي الخصم",
                 _sum((l.get("discount") or {}).get("amount")
                      for l in lines if isinstance(l, dict)),
                 doc.get("totalDiscountAmount"),
                 "totalDiscountAmount = مجموع discount.amount لكل البنود")

    sales_total = _dec(doc.get("totalSalesAmount"))
    disc_total = _dec(doc.get("totalDiscountAmount"))
    if sales_total is not None and disc_total is not None:
        _check_equal(out, "netAmount", "صافي المبلغ",
                     sales_total - disc_total, doc.get("netAmount"),
                     "netAmount = totalSalesAmount − totalDiscountAmount")

    if "totalItemsDiscountAmount" in doc:
        _check_equal(out, "totalItemsDiscountAmount", "إجمالي خصم الأصناف",
                     _sum(l.get("itemsDiscount") for l in lines if isinstance(l, dict)),
                     doc.get("totalItemsDiscountAmount"),
                     "totalItemsDiscountAmount = مجموع itemsDiscount لكل البنود")

    # ── الضرائب: كل نوع مقابل مجموعه من البنود ──
    per_type: dict[str, Decimal] = {}
    for line in lines:
        if not isinstance(line, dict):
            continue
        for item in line.get("taxableItems") or []:
            if isinstance(item, dict) and "taxType" in item:
                d = _dec(item.get("amount"))
                if d is not None:
                    per_type[item["taxType"]] = per_type.get(item["taxType"], Decimal(0)) + d

    stated_types: set[str] = set()
    for j, tt in enumerate(doc.get("taxTotals") or []):
        if not isinstance(tt, dict) or "taxType" not in tt:
            continue
        t = tt["taxType"]
        stated_types.add(t)
        _check_equal(out, f"taxTotals[{j}] ({t})", f"إجمالي الضريبة {t}",
                     per_type.get(t, Decimal(0)), tt.get("amount"),
                     f"taxTotals لنوع {t} = مجموع taxableItems من هذا النوع في كل البنود")

    for missing in sorted(set(per_type) - stated_types):
        out.append(Finding(
            "خطأ", "taxTotals", f"نوع الضريبة {missing} موجود في البنود وغائب عن الإجماليات",
            expected=f"سطر لـ{missing} بمبلغ {per_type[missing]}", actual="غائب",
            fix=f"أضف {{'taxType': '{missing}', 'amount': {per_type[missing]}}} إلى taxTotals",
        ))

    # ── الإجمالي النهائي ──
    extra = _dec(doc.get("extraDiscountAmount")) or Decimal(0)
    _check_equal(out, "totalAmount", "الإجمالي",
                 _sum(l.get("total") for l in lines if isinstance(l, dict)) - extra,
                 doc.get("totalAmount"),
                 "totalAmount = مجموع total لكل البنود − extraDiscountAmount")

    return out


def format_report(findings: list[Finding]) -> str:
    """تقرير للقراءة البشرية — ورسالته أهم من كشفه."""
    if not findings:
        return "✅ لا ملاحظات حسابية. (بحدود القواعد المشتقّة — راجع UNRESOLVED)"
    errors = [f for f in findings if f.severity == "خطأ"]
    head = f"⚠️ {len(findings)} ملاحظة، منها {len(errors)} تمنع القبول:\n"
    return head + "\n\n".join(str(f) for f in findings)

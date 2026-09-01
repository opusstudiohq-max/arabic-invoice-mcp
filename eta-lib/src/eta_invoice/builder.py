"""
بنّاء مستند الفاتورة الإلكترونية المصرية.

المُحقِّق يمسك الخطأ بعد وقوعه؛ وهذا **يمنع وقوعه**: يحسب كل حقل مشتقّ
بـ`Decimal` ويجمّع الإجماليات، فلا يبقى للمستخدم أن يخطئ في الحساب.

### مبدأ التصميم: **لا نخترع مالاً**

معادلة `invoiceLines[].total` **لم تُشتقّ** من العيّنة الرسمية (التفصيل في
`validation.UNRESOLVED`). ولذلك لا يخمّنها هذا البنّاء ولا يحسبها — بل
**يأخذها من نظام العميل المحاسبي**، وهو يملكها أصلاً لأنها ما يُطالِب به
عميله فعلاً.

فما يفعله البنّاء هو ما يستطيع إثباته:
- يحسب `salesTotal` و`netTotal` ومبالغ الضرائب من النِسب
- يجمّع كل إجماليات المستند من البنود
- **ويفحص ناتجه بنفسه** بـ`validate_document` قبل أن يسلّمه

فإن أخفق الفحص، رمى استثناءً بدل أن يسلّم مستنداً يُرفض لاحقاً بلا تشخيص.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .validation import format_report, validate_document

__all__ = ["Address", "Party", "Tax", "InvoiceLine", "InvoiceBuilder", "BuildError"]


class BuildError(ValueError):
    """يُرمى حين يخفق المستند في فحص البنّاء لنفسه."""


def _q(value: Decimal | str | int | float, places: int = 2) -> Decimal:
    """تقريب نصف-لأعلى إلى عدد منازل — لا تقريب مصرفي ولا عائم."""
    return Decimal(str(value)).quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


def _num(value: Decimal) -> float:
    """
    تحويل للإخراج في JSON.

    ⚠️ ملاحظة واعية: `json.dumps` يكتب `947.0` لـ`float(947)`، والمواصفة
    تأخذ القيمة بشكلها اللفظي. فمن أراد شكلاً بعينه فليكتب المستند بنفسه
    من القيم العشرية — ولهذا يُصدَّر `build_decimal()` أيضاً.
    """
    return float(value)


@dataclass
class Address:
    country: str = "EG"
    governate: str = ""
    regionCity: str = ""
    street: str = ""
    buildingNumber: str = ""
    branchID: str = ""
    postalCode: str = ""
    floor: str = ""
    room: str = ""
    landmark: str = ""
    additionalInformation: str = ""

    def to_dict(self, include_branch: bool) -> dict:
        out: dict[str, Any] = {}
        if include_branch and self.branchID:
            out["branchID"] = self.branchID
        out.update({
            "country": self.country,
            "governate": self.governate,
            "regionCity": self.regionCity,
            "street": self.street,
            "buildingNumber": self.buildingNumber,
        })
        for k in ("postalCode", "floor", "room", "landmark", "additionalInformation"):
            v = getattr(self, k)
            if v:
                out[k] = v
        return out


@dataclass
class Party:
    """طرف — مُصدِر أو مستلم. `type`: B منشأة، P فرد، F أجنبي."""

    id: str
    name: str
    address: Address
    type: str = "B"

    def to_dict(self, is_issuer: bool) -> dict:
        return {
            "address": self.address.to_dict(include_branch=is_issuer),
            "type": self.type,
            "id": self.id,
            "name": self.name,
        }


@dataclass
class Tax:
    """
    ضريبة على بند. `amount` يُحسب من النسبة على الوعاء ما لم يُمرَّر صراحةً.

    والوعاء الافتراضي هو `netTotal` — وهو الشائع لضريبة القيمة المضافة (T1).
    ومن احتاج وعاءً آخر فليمرّر `amount` بنفسه.
    """

    taxType: str
    rate: Decimal | str | float | None = None
    subType: str = ""
    amount: Decimal | str | float | None = None

    def resolve(self, base: Decimal) -> tuple[Decimal, Decimal]:
        if self.amount is not None:
            amt = _q(self.amount)
            rate = _q(self.rate if self.rate is not None else 0)
        else:
            if self.rate is None:
                raise BuildError(f"الضريبة {self.taxType} بلا نسبة ولا مبلغ")
            rate = _q(self.rate)
            amt = _q(base * rate / Decimal(100))
        return rate, amt


@dataclass
class InvoiceLine:
    """
    بند فاتورة.

    `total` **مطلوب** ويأتي من نظامك المحاسبي — لا يحسبه البنّاء، لأن
    معادلته لم تُشتقّ من مواصفة الهيئة (`validation.UNRESOLVED`).
    """

    description: str
    quantity: Decimal | str | int | float
    unit_price_egp: Decimal | str | int | float
    total: Decimal | str | int | float
    item_code: str = ""
    item_type: str = "GS1"
    unit_type: str = "EA"
    internal_code: str = ""
    discount_amount: Decimal | str | float = 0
    discount_rate: Decimal | str | float = 0
    items_discount: Decimal | str | float = 0
    value_difference: Decimal | str | float = 0
    total_taxable_fees: Decimal | str | float = 0
    taxes: list[Tax] = field(default_factory=list)
    currency_sold: str = "EGP"
    amount_sold: Decimal | str | float | None = None
    exchange_rate: Decimal | str | float | None = None

    def to_dict(self) -> tuple[dict, dict[str, Decimal]]:
        qty = _q(self.quantity, 8)
        unit = _q(self.unit_price_egp)
        sales = _q(qty * unit)
        discount = _q(self.discount_amount)
        net = _q(sales - discount)

        taxable: list[dict] = []
        per_type: dict[str, Decimal] = {}
        for tax in self.taxes:
            rate, amt = tax.resolve(net)
            taxable.append({
                "taxType": tax.taxType,
                "amount": _num(amt),
                "subType": tax.subType or tax.taxType,
                "rate": _num(rate),
            })
            per_type[tax.taxType] = per_type.get(tax.taxType, Decimal(0)) + amt

        unit_value: dict[str, Any] = {"currencySold": self.currency_sold, "amountEGP": _num(unit)}
        if self.currency_sold != "EGP":
            if self.amount_sold is None or self.exchange_rate is None:
                raise BuildError("عملة أجنبية بلا amount_sold أو exchange_rate")
            unit_value["amountSold"] = _num(_q(self.amount_sold))
            unit_value["currencyExchangeRate"] = _num(_q(self.exchange_rate, 5))

        line = {
            "description": self.description,
            "itemType": self.item_type,
            "itemCode": self.item_code,
            "unitType": self.unit_type,
            "quantity": _num(qty),
            "internalCode": self.internal_code,
            "salesTotal": _num(sales),
            "total": _num(_q(self.total)),
            "valueDifference": _num(_q(self.value_difference)),
            "totalTaxableFees": _num(_q(self.total_taxable_fees)),
            "netTotal": _num(net),
            "itemsDiscount": _num(_q(self.items_discount)),
            "unitValue": unit_value,
            "discount": {"rate": _num(_q(self.discount_rate)), "amount": _num(discount)},
            "taxableItems": taxable,
        }
        totals = {
            "sales": sales,
            "discount": discount,
            "items_discount": _q(self.items_discount),
            "total": _q(self.total),
        }
        return line, {**totals, **{f"tax:{k}": v for k, v in per_type.items()}}


@dataclass
class InvoiceBuilder:
    """يبني مستنداً كاملاً ويفحصه بنفسه قبل التسليم."""

    issuer: Party
    receiver: Party
    internal_id: str
    activity_code: str
    document_type: str = "I"
    document_type_version: str = "1.0"
    issued_at: datetime | None = None
    extra_discount_amount: Decimal | str | float = 0
    lines: list[InvoiceLine] = field(default_factory=list)

    def add_line(self, line: InvoiceLine) -> "InvoiceBuilder":
        self.lines.append(line)
        return self

    def build(self) -> dict:
        """
        يبني المستند **ويفحصه**. يرمي `BuildError` إن أخفق فحصه لنفسه —
        فتسليم مستند يُرفض لاحقاً بلا تشخيص أسوأ من الفشل هنا بتشخيص.
        """
        if not self.lines:
            raise BuildError("لا يمكن بناء فاتورة بلا بنود")

        when = self.issued_at or datetime.now(timezone.utc)
        if when.tzinfo is not None:
            when = when.astimezone(timezone.utc)

        line_dicts: list[dict] = []
        agg: dict[str, Decimal] = {}
        for line in self.lines:
            d, totals = line.to_dict()
            line_dicts.append(d)
            for k, v in totals.items():
                agg[k] = agg.get(k, Decimal(0)) + v

        sales = agg.get("sales", Decimal(0))
        discount = agg.get("discount", Decimal(0))
        extra = _q(self.extra_discount_amount)

        tax_totals = [
            {"taxType": k.split(":", 1)[1], "amount": _num(v)}
            for k, v in agg.items() if k.startswith("tax:")
        ]

        doc = {
            "issuer": self.issuer.to_dict(is_issuer=True),
            "receiver": self.receiver.to_dict(is_issuer=False),
            "documentType": self.document_type,
            "documentTypeVersion": self.document_type_version,
            "dateTimeIssued": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "taxpayerActivityCode": self.activity_code,
            "internalID": self.internal_id,
            "invoiceLines": line_dicts,
            "totalDiscountAmount": _num(discount),
            "totalSalesAmount": _num(sales),
            "netAmount": _num(_q(sales - discount)),
            "taxTotals": tax_totals,
            "extraDiscountAmount": _num(extra),
            "totalItemsDiscountAmount": _num(agg.get("items_discount", Decimal(0))),
            "totalAmount": _num(_q(agg.get("total", Decimal(0)) - extra)),
        }

        findings = validate_document(doc)
        if findings:
            raise BuildError(
                "المستند المبنيّ أخفق في فحص البنّاء لنفسه — وهذا عيب في "
                "البنّاء لا في مدخلاتك، فأبلغ عنه:\n" + format_report(findings)
            )
        return doc

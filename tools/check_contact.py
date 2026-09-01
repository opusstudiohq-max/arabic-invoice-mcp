#!/usr/bin/env python3
"""
بوابة القمع: كل صفحةٍ منشورة فيها سبيلُ تواصل، والعنوان نصٌّ ظاهر.

### لماذا

المشروع كلّه موجود لسببٍ واحد: أن يصل من يحتاجنا إلينا. وحين دُقِّق المسار
لأول مرّة كانت النتيجة: **أربعُ صفحاتٍ حيّة من خمسٍ بلا سبيلٍ أصلاً** —
أداةُ الفاتورة، وأداةُ الشيكات، ومقياسا التفقيط والـPDF. ولم يشتكِ شيء،
لأن لا أحد كان يفحص الخطوة الأخيرة.

وفي الفاحص كان أسوأ: البطاقة تظهر **عند الإخفاق وحده**، فمن مرّ رمزُه سليماً
لم يجد سبيلاً — ونصفُ الزوّار كذلك.

### وشرطان لا شرطٌ واحد

① **رابط `mailto:`** — للمستعمل الذي يفتح له بريدٌ مثبَّت.
② **العنوان نصّاً ظاهراً** — لمن يستعمل بريده عبر المتصفّح، وهم الأكثر؛
   ينقر الرابط فلا يحدث شيء، فإن لم يجد عنواناً ينسخه بقي بلا سبيل.

فالفحص على الاثنين. ووجودُ أحدهما وحده يُعدّ إخفاقاً، لأنه يبدو سليماً وهو
يُسقط نصف من يحاول.

    python tools/check_contact.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: الأسطح المنشورة فعلاً. المسار هنا هو **ما يُنشر** لا ما يُحرَّر:
#: `invoice-tool/dist` هو ما يراه الزائر، والمصدرُ لا يراه أحد.
#:
#: ولكلٍّ **مساران**: اسمُه في مستودع العمل، واسمُه في المستودع العام —
#: فالخريطة تختلف بينهما (`pdf-benchmark` هنا هو `pdf` هناك). ويكفي أن
#: يوجد أحدهما، لأن هذه البوابة تُشغَّل في المستودعين كليهما.
SURFACES = (
    ("invoice-tool/dist/index.html", "invoice/index.html"),
    ("cheque-tool/dist/mutawafiq-cheque.html", "cheque/dist/mutawafiq-cheque.html"),
    ("zatca-checker/index.html", "checker/index.html"),
    ("zatca-checker/batch.html", "checker/batch.html"),
    ("pdf-benchmark/index.html", "pdf/index.html"),
    ("tafgeet-benchmark/index.html", "tafgeet/index.html"),
    ("zatca-qr-benchmark/index.html", "zatca-qr/index.html"),
)

MAILTO = re.compile(r'href="mailto:([^"?]+)')
#: العنوان بين وسمين — أي معروضاً للقارئ، لا داخل سمةٍ ولا تعليق.
AS_TEXT = re.compile(r">\s*([^<\s]+@[^<\s]+\.[a-z]{2,})\s*<", re.I)


def check(path: Path) -> list[str]:
    if not path.exists():
        return [f"{path.relative_to(ROOT).as_posix()} — الملف غائب"]

    html = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(ROOT).as_posix()
    problems: list[str] = []

    links = set(MAILTO.findall(html))
    texts = set(AS_TEXT.findall(html))

    if not links:
        problems.append(f"{rel} — لا رابط mailto")
    if not texts:
        problems.append(f"{rel} — العنوان غير ظاهرٍ نصّاً (من يستعمل بريد المتصفح يبقى بلا سبيل)")
    if links and texts and not (links & texts):
        problems.append(
            f"{rel} — عنوان الرابط {sorted(links)} يخالف المعروض نصّاً {sorted(texts)}"
        )
    return problems


def resolve(names: tuple[str, ...]) -> Path | None:
    """يُعيد أول مسارٍ موجود من بدائل السطح، أو None إن غاب كلاهما."""
    for name in names:
        path = ROOT / name
        if path.exists():
            return path
    return None


def main() -> int:
    problems: list[str] = []
    checked = 0
    for names in SURFACES:
        path = resolve(names)
        if path is None:
            problems.append(f"{names[0]} — غائبٌ بكلّ أسمائه: {' أو '.join(names)}")
            continue
        checked += 1
        problems.extend(check(path))

    if problems:
        print(f"✖ {len(problems)} خللاً في مسار التواصل:\n")
        for p in problems:
            print("   " + p)
        print("\nكل صفحةٍ منشورة تحتاج رابط mailto **و** العنوان نصّاً ظاهراً.")
        return 1

    print(f"✓ مسار التواصل قائم في {checked} سطحاً منشوراً")
    return 0


if __name__ == "__main__":
    sys.exit(main())

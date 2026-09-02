#!/usr/bin/env python3
"""
بوابة أعداد الاختبارات المنسوبة لحزمة — تُشغّل السويتات وتقارن.

### الثغرة التي تسدّها

`claims_lint.check_test_counts()` يقارن الأعداد المذكورة في الأصول بعضها
ببعض وبعدد مجموعة بايثون. ولمّا أخفق على جدولٍ يعدّد الحزم («38 لهذه و183
لتلك، وكلاهما صواب») أُضيف إعفاء: كل سطرٍ **يسمّي حزمة** يُتخطّى.

والإعفاء أصاب في منع الإخفاق الكاذب، **وفتح ثغرةً**: صار العدد المنسوب
لحزمةٍ لا يُفحص أصلاً. فانجرف `fatura` من 38 إلى 40 عبر جلستين، معلَناً 38
في ثلاثة مواضع، ولا بوابة تنبس.

فالإعفاء لا يُلغى — يُستكمل. هذه البوابة **تُشغّل كل سويت وتقرأ عددها من
`node --test` نفسه**، ثم تقارنه بما تعلنه الأصول. لا رقم يُستعاد من ذاكرة.

    python tools/check_test_counts.py           # يقارن
    python tools/check_test_counts.py --list    # يطبع المقيس فقط
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent

#: اسمُ الحزمة كما يُذكر في النصّ ⇒ مجلداتها المحتملة.
#:
#: مجلدان لا واحد: اسمُه في مستودع العمل واسمُه في المستودع العام
#: (`arabic-text` هنا هو `nasq` هناك). وبوابةٌ تعمل في مستودعٍ وتعمى في
#: الآخر ليست بوابة.
PACKAGES = {
    "nasq": ("arabic-text", "nasq"),
    "fatura": ("invoice-pdf", "fatura"),
}

#: الأصول التي تُفحص. مجلداتٌ لا تُمسح كلها — الادعاء يعيش في التوثيق.
DOCS = ("README.md", "PUBLISHING.md", "invoice-tool/README.md",
        "arabic-text/README.md", "invoice-pdf/README.md")

COUNT_LINE = re.compile(r"(\d{2,4})\s*(?:اختبار|اختباراً|اختبارًا|tests?)")
TOTAL = re.compile(r"^# tests (\d+)", re.M)


def locate(folders: tuple[str, ...]) -> Path | None:
    for folder in folders:
        path = ROOT / folder
        if (path / "package.json").exists():
            return path
    return None


def measure(path: Path) -> int | None:
    """
    يشغّل `npm test` ويقرأ العدد من مخرَجه — لا من ملفٍ مخزّن.

    ويُعيد None إن تعذّر. والتمييز بين «تعذّر» و«انجرف» يقع عند المستدعي:
    غيابُ `node_modules` ظرفٌ لا عيب.
    """
    try:
        run = subprocess.run(
            ["npm", "test", "--silent"], cwd=path, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=300,
            shell=os.name == "nt",
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    out = (run.stdout or "") + (run.stderr or "")
    m = TOTAL.search(out) or re.search(r"ℹ tests (\d+)", out)
    return int(m.group(1)) if m else None


def claims(name: str) -> list[tuple[str, int, str]]:
    """كل عددٍ يقع في سطرٍ يسمّي الحزمة — وهي الأسطر التي يُعفيها claims_lint."""
    found: list[tuple[str, int, str]] = []
    for doc in DOCS:
        path = ROOT / doc
        if not path.exists():
            continue
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if name not in line:
                continue
            for m in COUNT_LINE.finditer(line):
                n = int(m.group(1))
                if n < 5:          # أرقامٌ صغيرة ليست عدّ سويت
                    continue
                found.append((f"{doc}:{i}", n, line.strip()[:90]))
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description="فحص أعداد اختبارات الحزم")
    ap.add_argument("--list", action="store_true", help="اطبع المقيس بلا مقارنة")
    args = ap.parse_args()

    problems: list[str] = []
    for name, folders in PACKAGES.items():
        path = locate(folders)
        if path is None:
            print(f"  – {name:<10} لا مجلد بأيٍّ من: {' أو '.join(folders)}")
            continue

        # غيابُ التبعيات ظرفُ بيئةٍ لا انجرافُ ادعاء. يُذكر ولا يُفشل، وحدُّ
        # البوابة مكتوبٌ صراحةً بدل أن يُوهم خضارُها بفحصٍ لم يقع.
        if not (path / "node_modules").exists():
            print(f"  – {name:<10} التبعيات غير مثبّتة هنا — لم يُقَس (شغّل npm install)")
            continue

        actual = measure(path)
        if actual is None:
            problems.append(f"{name} ({path.name}) — السويت مثبَّتة ولم تُعطِ عدداً: سويتٌ مكسورة")
            continue
        if args.list:
            print(f"  {name:<10} {actual}")
            continue

        stated = claims(name)
        if not stated:
            print(f"  {name:<10} {actual} — لا ادعاء في الأصول")
            continue
        for where, n, line in stated:
            if n != actual:
                problems.append(f"{where} يعلن {n} لـ«{name}» والواقع {actual} — {line}")
        if all(n == actual for _, n, _ in stated):
            print(f"  ✓ {name:<10} {actual} — يطابق {len(stated)} ادعاءً")

    if problems:
        print(f"\n✖ {len(problems)} انجرافاً في أعداد الحزم:\n")
        for p in problems:
            print("   " + p)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

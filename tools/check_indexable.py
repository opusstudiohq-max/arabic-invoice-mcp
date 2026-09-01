#!/usr/bin/env python3
"""
بوابة الفهرسة: كل صفحةٍ منشورة إمّا في خريطة الموقع، وإمّا ممنوعةُ الفهرسة.

### العيب الذي تسدّه

المستودع العام يحوي **عشر** صفحات HTML، وخريطة الموقع تذكر **سبعاً**. وما
لم يُذكر لم يكن غائباً عن الشبكة — كان **منشوراً ومرئياً بلا حساب**:

- `/invoice-tool/index.html` و`/cheque/index.html`: صفحتا **المصدر** لا
  الأداة. سكربتُهما وحدةُ ES باستيراداتٍ مجرّدة، فيُخفق في المتصفّح — قِيس:
  **404 في الطرفية**. وتبدوان كالأداة تماماً: العنوان نفسه والنموذج نفسه.
  فمن يصلهما من بحثٍ يرى منتجاً لا يعمل، وينصرف.
- `/python-lib/index.html`: صفحةُ هبوطٍ قديمة، لا يشير إليها شيء.
- و`/checker/batch.html` — صفحة **مكاتب المحاسبة**، أعلى شريحةٍ قيمةً في
  نموذج العمل — كانت **غائبة عن الخريطة**، أي غير مرئيةٍ للبحث.

فالحالتان طرفان لعيبٍ واحد: **لا أحد يقرّر عن كل صفحةٍ منشورة هل تُفهرس**.

### القاعدة

لكل صفحةٍ في المستودع العام أحد جوابين، ولا ثالث:

① مذكورةٌ في `sitemap.xml` — أي **يُقصد** أن تُفهرس، أو
② تحمل `<meta name="robots" content="noindex">` — أي **يُقصد** ألّا تُفهرس.

والصمت ليس جواباً.

    python tools/check_indexable.py
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PRUNED = {"node_modules", ".git", "cache", "data", "__pycache__", ".venv",
          "fonts", "site", "examples", "samples", "tests"}

NOINDEX = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', re.I)
LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")

#: أصلُ الموقع المنشور. يُقرأ من الخريطة نفسها فلا يُكتب مرّتين.
def site_root(locs: list[str]) -> str:
    return min(locs, key=len).rstrip("/") + "/" if locs else ""


def iter_pages():
    for parent, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in PRUNED and not d.startswith(".")]
        for name in files:
            if name.lower().endswith(".html"):
                yield Path(parent) / name


def main() -> int:
    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists():
        print("– لا خريطة موقع في هذا المستودع — تُفحص في المستودع العام")
        return 0

    locs = LOC.findall(sitemap.read_text(encoding="utf-8"))
    root_url = site_root(locs)
    listed = {u.rstrip("/") for u in locs}
    # الصفحة الرئيسية لمجلدٍ تُذكر عادةً بمساره لا باسم الملف
    listed |= {u.rstrip("/") + "/index.html" for u in locs}

    problems, indexed, blocked = [], 0, 0
    for page in sorted(iter_pages()):
        rel = page.relative_to(ROOT).as_posix()
        url = (root_url + rel).rstrip("/")
        folder_url = (root_url + rel[: -len("index.html")]).rstrip("/")

        if url in listed or folder_url in listed:
            indexed += 1
            continue
        if NOINDEX.search(page.read_text(encoding="utf-8", errors="replace")):
            blocked += 1
            continue
        problems.append(
            f"{rel} — منشورةٌ ولا هي في الخريطة ولا ممنوعةُ الفهرسة. "
            f"قرّر: أضِفها إلى sitemap.xml أو ضع فيها noindex."
        )

    if problems:
        print(f"✖ {len(problems)} صفحةً بلا قرارِ فهرسة:\n")
        for p in problems:
            print("   " + p)
        return 1

    print(f"✓ قرارُ الفهرسة معلومٌ لكل صفحة — {indexed} في الخريطة، {blocked} ممنوعة")
    return 0


if __name__ == "__main__":
    sys.exit(main())

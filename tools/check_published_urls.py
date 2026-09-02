#!/usr/bin/env python3
"""
يفحص أن كل رابط في `PUBLISHED.json` يستجيب فعلاً.

**لماذا:** سجّلنا رابط المقياس `…/tafgeet-benchmark/` وهو خطأ — اسم المجلد
في المستودع العام `tafgeet/`. فبقي رابطٌ في سجلّ «ما نُشر فعلاً» يعطي 404،
والسجلُّ هو ما يحرس ادعاءات النشر. حارسٌ يحمل خطأً أسوأ من غيابه.

ولا يُدمج هذا في `claims_lint` لأنه يحتاج شبكة، والبوابة يجب أن تعمل بلا
إنترنت. يُشغَّل يدوياً بعد كل نشر:

    python tools/check_published_urls.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "OpusStudio/1.0 (+opus.studio.hq@gmail.com)"}


def probe(url: str, timeout: int = 30) -> tuple[int, str]:
    request = urllib.request.Request(url, headers=UA, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, ""
    except urllib.error.HTTPError as e:
        return e.code, e.reason
    except Exception as e:                      # شبكة، مهلة، شهادة…
        return 0, str(e)[:80]


def main() -> int:
    registry = json.loads((ROOT / "PUBLISHED.json").read_text(encoding="utf-8"))
    entries = [(e["name"], e["url"]) for key in ("github_pages", "github_repos")
               for e in registry.get(key, [])]
    if not entries:
        print("لا روابط مسجّلة.")
        return 0

    problems = []
    for name, url in entries:
        status, why = probe(url)
        mark = "✓" if status == 200 else "✖"
        print(f"  {mark} {status or '—'}  {name}  {url}")
        if status != 200:
            problems.append(f"{name}: {url} ⇒ {status or 'تعذّر الوصول'} {why}".strip())

    if problems:
        print("\nروابط مسجَّلة لا تستجيب — أصلح السجلّ أو انشر ما ينقص:")
        for p in problems:
            print("  •", p)
        return 1
    print(f"\nكل الروابط المسجَّلة ({len(entries)}) تستجيب.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

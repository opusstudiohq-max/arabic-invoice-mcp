#!/usr/bin/env python3
"""
يفحص أن كل رابط داخلي في الأصول العامة يشير إلى ملفٍ موجود.

**لماذا:** كانت الروابط الأربعة كلها في README المستودع العام مكسورة —
تشير إلى `arabic-invoice-mcp/` واسم المجلد هناك `python-lib/`. سببها أن
الملف يُنسخ من مستودع العمل إلى مستودعٍ بأسماء مجلدات مختلفة، فتنجو
الروابط في الأول وتموت في الثاني. والواجهة الأولى للمشروع كانت مكسورة
كلها بلا أن يظهر شيء.

    python tools/check_links.py
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location("claims_lint", ROOT / "tools" / "claims_lint.py")
_cl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cl)

MD_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
HTML_HREF = re.compile(r'(?:href|src)="([^"]+)"')
EXTERNAL = ("http://", "https://", "mailto:", "#", "data:", "//")

FENCED = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")


def strip_code(text: str) -> str:
    """
    الكود ليس روابط.

    أوّل تشغيلٍ لهذا الحارس أبلغ عن رابطين في `marketing/github-seo.md`،
    وهما داخل ``backticks`` في سطرٍ يشرح **صياغة** وسم الصورة لا يشير إلى
    ملف. أي أن الحارس أفشل صواباً — وذاك أسوأ من غيابه، لأنه يُكسب الخطأ
    ثقته حين يمرّ.
    """
    return INLINE_CODE.sub(" ", FENCED.sub(" ", text))


#: تعبيرُ قالبٍ لا مسارُ ملف: Liquid في قوالب Jekyll (`{{ … }}` و`{% … %}`)
#: وقالبُ جافاسكربت النصّي (`${…}`). يُحلّ عند البناء، فلا وجود له على القرص.
TEMPLATE = re.compile(r"\{\{|\{%|\$\{")


def internal_links(text: str):
    text = strip_code(text)
    for pattern in (MD_LINK, HTML_HREF):
        for m in pattern.finditer(text):
            target = m.group(1).strip()
            if not target or target.startswith(EXTERNAL):
                continue
            # أُضيف بعد أن أفشل الحارسُ `href="{{ site.url }}{{ site.baseurl }}/"`
            # في قالب Jekyll — وهو صحيح، ويصير عنواناً كاملاً بعد البناء.
            # وحارسٌ يُفشل الصواب يُكسب الخطأ ثقته حين يمرّ.
            if TEMPLATE.search(target):
                continue
            yield target


def check() -> list[str]:
    problems: list[str] = []
    for path in _cl.iter_public_files():
        if path.suffix not in {".md", ".html"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for target in internal_links(text):
            clean = target.split("#")[0].split("?")[0]
            if not clean:
                continue
            resolved = (path.parent / clean).resolve()
            if not resolved.exists():
                rel = path.relative_to(ROOT).as_posix()
                problems.append(f"{rel} ⇒ «{target}»")
    return problems


def main() -> int:
    problems = check()
    if problems:
        print(f"روابط داخلية مكسورة: {len(problems)}\n")
        for p in problems:
            print("  ✖", p)
        return 1
    print("كل الروابط الداخلية في الأصول العامة تشير إلى ملفات موجودة.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

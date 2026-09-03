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
import posixpath
import re
import sys
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent

#: مسارٌ جذريّ كما تكتبه الصفحة ⇒ موضعُه في **مستودع العمل** قبل النسخ.
#: في المستودع العام يقع حيث يشير تماماً، فلا يُطابَق شيءٌ وتُستعمل القيمة
#: كما هي. والخريطةُ هنا انعكاسٌ لخطة النسخ في `sync_public.py` — فأيُّ
#: إضافةٍ هناك بمسارٍ جذريٍّ تحتاج سطراً هنا.
WORK_LAYOUT = {
    "js/mtq.js": "analytics/mtq.js",
    # مساراتُ الموقع كما يكتبها شريطُ الروابط المتقاطعة. وهي جذريةٌ عمداً:
    # الصفحات تقع على أعماقٍ مختلفة (`/checker/` و`/zatca-qr/en/`)، فرابطٌ
    # نسبيٌّ واحد لا يصحّ فيها جميعاً. ومصدرُها `tools/build_crosslinks.py`،
    # ويربط بينهما اختبارٌ فيُفشل أيَّ مسارٍ يُضاف هناك ولا يُذكر هنا.
    "checker": "zatca-checker",
    "checker/batch.html": "zatca-checker/batch.html",
    "invoice": "invoice-tool/dist",
    "cheque/dist/mutawafiq-cheque.html": "cheque-tool/dist/mutawafiq-cheque.html",
    "zatca-qr": "zatca-qr-benchmark",
    "pdf": "pdf-benchmark",
    "tafgeet": "tafgeet-benchmark",
    # وأسماءُ المكتبات: المستودعان يسمّيان المجلدات بغير اسم، وهو سببُ
    # وجود هذا الحارس أصلاً — أربعةُ روابطَ ماتت في الصفحة الأولى لذلك.
    "nasq": "arabic-text",
    "fatura-zatca": "invoice-pdf",
    "python-lib": "arabic-invoice-mcp",
    "typescript-lib": "arabic-invoice-mcp-ts",
}

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


def resolve_site_path(site_rel: str) -> Path:
    """يحلّ مساراً **كما يقع على الموقع** إلى موضعه في مستودع العمل.

    والمطابقةُ بالبادئة لا بالمساواة: `invoice` وحدها تكفي لحلّ
    `invoice/fonts/OFL.txt`، فلا تُسرد كلُّ ورقةٍ في الخريطة.

    والخريطةُ **بديلٌ لا أصل**: في المستودع العام يقع الملفُّ حيث يشير
    تماماً، فيُقبل مباشرةً ولا تُستشار. وأوّلُ صياغةٍ طبّقتها دائماً
    فأفشلت الحارسَ هناك — إذ لا `analytics/` في العام.
    """
    site_rel = posixpath.normpath(site_rel).strip("/")
    if not site_rel or site_rel == ".":
        return ROOT
    direct = ROOT / site_rel
    if direct.exists():
        return direct
    parts = site_rel.split("/")
    for i in range(len(parts), 0, -1):
        mapped = WORK_LAYOUT.get("/".join(parts[:i]))
        if mapped:
            return ROOT.joinpath(mapped, *parts[i:])
    return direct


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

            # **الرابطُ يُحَلّ من حيث يقع الملف بعد النسخ، لا من حيث
            # يعيش الآن.** فـ`pages/` يُنسخ إلى جذر المستودع العام:
            # `pages/README.md` يصير `./README.md`، و`pages/_layouts/x.html`
            # يصير `./_layouts/x.html`. وبغير ذلك يُفشل الحارسُ صواباً.
            rel_parts = list(path.relative_to(ROOT).parts)
            if rel_parts and rel_parts[0] == "pages":
                rel_parts.pop(0)
            here = "/".join(rel_parts[:-1])

            # والمسارُ الجذريّ يُحَلّ إلى جذر الموقع لا إلى مجلد الصفحة.
            # وكان `(path.parent / "/js/x")` يُنتج جذرَ القرص على ويندوز —
            # أي أن كل رابطٍ جذريٍّ كان يُفحص خطأً، ولم يظهر لأن أصولنا لم
            # تحمل واحداً حتى ذلك اليوم.
            site_rel = clean.lstrip("/") if clean.startswith("/") else (
                f"{here}/{clean}" if here else clean)
            resolved = resolve_site_path(site_rel)

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

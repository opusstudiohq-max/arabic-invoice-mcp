#!/usr/bin/env python3
"""
بوابة الاتجاه: لا رقمٌ مركّب بشرطة في نصٍّ عربي بلا عزل.

### لماذا هذه البوابة موجودة

نشرنا **مقياساً** يوثّق أن «2026-09-01» في فقرةٍ يمينية يُعرض «01-09-2026»،
ويسمّي القاعدة (W4 من UAX #9: الشرطة ES لا تلتحق بالرقم العربي الصنف)،
ويقول إن العلاج العزل.

ثم ارتكبنا الحالة نفسها **في تذييل الصفحة التي تقولها** — على صفحتين
منشورتين. ولم يظهر شيء في أي اختبار: النصّ في المصدر صحيح، والانقلاب لا
يحدث إلا عند **العرض**.

اكتشفه قياسُ الترتيب البصري في متصفّح (مواضع المحارف بـ`Range`)، لا النظر
إلى لقطة شاشة. ولذلك تُفحص هنا **بنية HTML**: أي رقمٍ مركّب بشرطة يظهر في
نصٍّ مرئي يجب أن يكون داخل عازلٍ اتجاهي.

### ما يُعدّ معزولاً

- داخل `<bdi>` أو عنصرٍ عليه `dir="ltr"`
- داخل `<pre>` — فهي `direction:ltr` في أوراقنا كلّها
- داخل `<code>` **إن** أعلنت الصفحة `unicode-bidi:isolate` لها
- محفوفٌ بمحارف العزل U+2066..U+2069

### ما لا يراه هذا الحارس

**النصّ الذي يُركّبه جافاسكربت في المتصفّح.** صفحةٌ تجلب `results.json`
وتبني فقراتها عند العرض لا يظهر نصّها في ملف HTML، فلا يفحصه هذا الحارس.
وقد وجدنا صفحةً منشورة كذلك بالضبط: قياسُ المتصفّح كشف تاريخها مقلوباً
والحارسُ صامت — لأن التاريخ لم يكن في الملف أصلاً.

فالحدّ مذكورٌ هنا ولا يُدّعى غيره. والصفحاتُ المولَّدة عندنا تُبنى قبل
النشر، فيراها الحارس كاملة.

    python tools/check_bidi.py
"""
from __future__ import annotations

import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: مجلداتٌ لا تُفحص — تبعيات وبناءات ومخرجات أدوات.
#
# **`dist` ليست في القائمة عمداً.** وهي أول ما يخطر: مخرجُ بناء لا مصدر.
# لكنّ `invoice-tool/dist` و`cheque-tool/dist` هما **الصفحتان المنشورتان
# فعلاً** — والمصدر لا يراه أحد. وقد ابتلعت قاعدةُ `dist/` في `.gitignore`
# أداةً مشحونة كاملة من قبل، فلا تُكرَّر الغفلة هنا.
PRUNED = {"node_modules", ".git", "cache", "data", "__pycache__", ".venv",
          "fonts", "site"}  # `site` ناتج MkDocs، متجاهَلٌ في git

#: تاريخٌ ISO، أو مدى «1-5»، أو أي سلسلةِ أرقامٍ تفصلها شرطات.
SUSPECT = re.compile(r"\d+(?:\s*-\s*\d+)+")

#: عناصر يكون ما بداخلها معزولاً أصلاً.
ISOLATING = {"bdi", "pre"}

#: عناصر لا نصّ مرئي فيها.
INVISIBLE = {"script", "style", "head", "title"}

#: عناصر تُنهي الفقرة — والانقلاب يقع داخل الفقرة الواحدة لا عبرها.
BLOCKS = {
    "p", "li", "td", "th", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "figcaption", "caption", "dd", "dt", "blockquote", "section",
    "header", "footer", "main", "article", "summary", "label",
}

#: محارف العزل الصريحة U+2066 LRI … U+2069 PDI.
EXPLICIT_ISOLATE = re.compile("[⁦⁧⁨][^⁩]*⁩")

ARABIC = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")


class VisibleText(HTMLParser):
    """
    يجمع النصّ المرئي **مقطّعاً على الفقرات**.

    وقد كُتب أول مرة يفحص كل عقدة نصّ وحدها، فسقط عليه
    `<p>في <code>2026-09-01</code> عربي</p>`: العربية في عقدةٍ والتاريخ في
    أخرى، فلم يرَ الحارس جواراً فصمت. أمسكه اختبارُ الحارس نفسه.
    """

    def __init__(self, code_is_isolated: bool) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool]] = []
        self.blocks: list[list[tuple[str, bool, int]]] = [[]]
        self.findings: list[tuple[int, str]] = []
        self.code_is_isolated = code_is_isolated

    def _isolating(self, tag: str, attrs) -> bool:
        """
        **`dir="rtl"` ليس عزلاً — وهذا الخطأ أفرغ الحارس من معناه.**

        كُتب أول مرة يقبل `dir` بأي قيمة. وجذر كل صفحاتنا `<html dir="rtl">`،
        فصار كلُّ نصٍّ فيها «معزولاً» بنظر الحارس، فمرّت صفحتان بهما التاريخ
        مقلوبٌ فعلاً على الشاشة. أمسكه أن الحارس صمت على عيبٍ **قِيس في
        المتصفّح**، لا أنه اشتكى.

        والعزل الذي يحمي مقطعاً لاتينياً هو `dir="ltr"` عليه؛ و`dir="rtl"`
        يُثبّت الاتجاه اليميني فيزيد الانقلاب رسوخاً.
        """
        if tag in ISOLATING:
            return True
        if tag == "code" and self.code_is_isolated:
            return True
        if tag in ("html", "body"):
            return False
        return any(k == "dir" and v == "ltr" for k, v in attrs)

    def _close_block(self) -> None:
        segments = self.blocks.pop()
        if not self.blocks:
            self.blocks.append([])
        if not any(ARABIC.search(text) for text, _, _ in segments):
            return
        for text, isolated, line in segments:
            if isolated:
                continue
            for m in SUSPECT.finditer(EXPLICIT_ISOLATE.sub("", text)):
                self.findings.append((line, m.group(0)))

    def handle_starttag(self, tag, attrs):
        self.stack.append((tag, self._isolating(tag, attrs)))
        if tag in BLOCKS:
            self.blocks.append([])

    def handle_startendtag(self, tag, attrs):
        pass  # عنصرٌ فارغ لا نصّ فيه

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                closing = [t for t, _ in self.stack[i:] if t in BLOCKS]
                del self.stack[i:]
                for _ in closing:
                    self._close_block()
                return

    def handle_data(self, data):
        if any(t in INVISIBLE for t, _ in self.stack):
            return
        isolated = any(flag for _, flag in self.stack)
        self.blocks[-1].append((data, isolated, self.getpos()[0]))

    def close(self):
        super().close()
        while len(self.blocks) > 1:
            self._close_block()
        self._close_block()


def check(path: Path) -> list[str]:
    html = path.read_text(encoding="utf-8", errors="replace")
    code_isolated = "unicode-bidi:isolate" in html.replace(" ", "")
    parser = VisibleText(code_isolated)
    parser.feed(html)
    parser.close()
    try:
        where = path.relative_to(ROOT)
    except ValueError:
        where = path  # ملفٌ خارج الشجرة — يُفحص في اختبار الحارس نفسه
    seen, out = set(), []
    for line, text in parser.findings:
        if (line, text) in seen:
            continue
        seen.add((line, text))
        out.append(f"{where}:{line} — «{text}» في نصٍّ عربي بلا عزل")
    return out


def iter_pages():
    """
    يمشي بـ`os.walk` ويقلّم **قبل الدخول** لا بعده.

    و`Path.rglob` يدخل `node_modules` ثم يُرشّح، فيسقط على ويندوز بـ
    `FileNotFoundError [WinError 3]` عند تجاوز مسارٍ حدَّ MAX_PATH — وقد
    أسقط بوابةَ الادعاءات من قبل بالسبب نفسه. الدرسُ مدفوعُ الثمن مرّتين.
    """
    for parent, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in PRUNED and not d.startswith(".")]
        for name in files:
            if name.lower().endswith(".html"):
                yield Path(parent) / name


def main() -> int:
    problems: list[str] = []
    pages = sorted(iter_pages())
    for page in pages:
        problems.extend(check(page))

    if problems:
        print(f"✖ {len(problems)} رقماً مركّباً بلا عزل في نصٍّ عربي:\n")
        for p in problems:
            print("   " + p)
        print("\nالعلاج: لُفّ المقطع في <bdi dir=\"ltr\"> — أو محارف العزل U+2066…U+2069.")
        print("والسبب: الشرطة ES لا تلتحق بالرقم العربي الصنف (W4)، فينقلب الترتيب عند العرض.")
        return 1

    print(f"✓ الاتجاه سليم — {len(pages)} صفحة، لا رقم مركّب بلا عزل")
    return 0


if __name__ == "__main__":
    sys.exit(main())

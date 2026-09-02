#!/usr/bin/env python3
"""
حارسُ وعدِ الخصوصية: القياسُ لا يستطيع حملَ بيانات فاتورة، والصفحةُ تقول ذلك.

### الوعدُ الذي يحرسه

صفحاتُنا تقول نصّاً: «بياناتك لا تُرفع لأي خادم». والقياسُ لا ينقضه — يرسل
أرقاماً ومعرّفاتٍ من قوائم معلومة — لكنّ **الصمت عنه ادّعاء**. فمن أضاف
القياس إلى صفحة لزمه أن يقول للزائر ماذا يُعدّ.

واختبارات `analytics/tests/` تُبرهن أن المخطَّط لا يقبل نصّاً حرّاً. وهذا
الحارسُ يفحص ما لا يفحصه اختبارُ وحدة:

1. المصدرُ لا يقرأ حقلَ إدخالٍ ولا يخزّن شيئاً في المتصفّح.
2. المسارُ المُرسَل بلا `search` ولا `hash`، ولا يُرسَل عنوانُ الصفحة.
3. كلُّ مفتاحٍ في المخطَّط يُبنى بأحد المُنشئات الأربعة المعلومة.
4. **كلُّ صفحةٍ تُحمِّل القياس تحمل سطرَ الإفصاح** — والشرطُ مشروط، فيسري
   وحدَه يوم تُركَّب ولا يُطالب بشيءٍ قبله.
5. أداةُ الشيكات لا تُحمِّله أبداً — وعدُها أنها تعمل بلا إنترنت.

    python tools/check_analytics_privacy.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent
IS_PUBLIC = not (ROOT / "tools" / "sync_public.py").exists()

TRACKER = ROOT / ("js/mtq.js" if IS_PUBLIC else "analytics/mtq.js")
SCRIPT_REF = re.compile(r"""<script[^>]+src=["'][^"']*\bmtq\.js""", re.I)

#: سطرُ الإفصاح — يكفي أن يظهر جوهرُه، فالصياغة تتطوّر.
DISCLOSURE = re.compile(r"بلا كوكيز|دون كوكيز|لا نستعمل كوكيز")

#: ما لا يجوز أن يظهر في مصدر القياس مطلقاً.
BANNED = [
    (r"\.value\b", "قراءةُ قيمة حقل إدخال"),
    (r"\btextarea\b", "لمسُ منطقة نصّ"),
    (r"\bFormData\b", "جمعُ نموذج"),
    (r"\blocalStorage\b", "تخزينٌ محلي"),
    (r"\bsessionStorage\b", "تخزينُ جلسة"),
    (r"document\.cookie", "كوكيز"),
    (r"document\.title", "عنوانُ الصفحة — سطحُ تسريبٍ لو كتبه سكربت"),
    (r"location\.search", "معاملاتُ العنوان"),
    (r"location\.hash", "جزءُ العنوان"),
    (r"\.innerText\b", "قراءةُ نصٍّ معروض"),
]

#: الصفحاتُ التي قد تُحمِّل القياس — يُفحص من حمّله منها.
PAGES = [
    ("zatca-qr-benchmark/index.html", "zatca-qr/index.html"),
    ("zatca-qr-benchmark/en/index.html", "zatca-qr/en/index.html"),
    ("pdf-benchmark/index.html", "pdf/index.html"),
    ("tafgeet-benchmark/index.html", "tafgeet/index.html"),
    ("zatca-checker/index.html", "checker/index.html"),
    ("zatca-checker/batch.html", "checker/batch.html"),
    ("invoice-tool/dist/index.html", "invoice/index.html"),
    ("pages/_layouts/default.html", "_layouts/default.html"),
]
OFFLINE_ONLY = ("cheque-tool/dist/mutawafiq-cheque.html", "cheque/dist/mutawafiq-cheque.html")


def main() -> int:
    print("المستودع:", "العام" if IS_PUBLIC else "العمل")
    fails: list[str] = []

    if not TRACKER.exists():
        print("  – وحدةُ القياس غير موجودة هنا — لا شيء يُفحص.")
        return 0

    src = TRACKER.read_text(encoding="utf-8")
    body = re.sub(r"/\*.*?\*/", "", src, flags=re.S)   # التعليقاتُ تشرح، ولا تنفّذ
    body = re.sub(r"^\s*//.*$", "", body, flags=re.M)

    print("\n① المصدرُ لا يقرأ إدخالاً ولا يخزّن:")
    for pat, why in BANNED:
        if re.search(pat, body):
            print("   ⛔ {:<22} {}".format(pat, why))
            fails.append("وحدةُ القياس تحوي {} — {}".format(pat, why))
        else:
            print("   ✅ {:<22} {}".format(pat, why))

    print("\n② كلُّ مفتاحٍ يُبنى بمُنشئٍ معلوم:")
    schema = re.search(r"var SCHEMA = \{(.*?)\n  \};", body, re.S)
    if not schema:
        fails.append("لم يُعثر على المخطَّط في المصدر")
        print("   ⛔ المخطَّط غير موجود")
    else:
        keys = re.findall(r"(\w+)\s*:\s*([a-z]+)\(", schema.group(1))
        bad = [(k, c) for k, c in keys if c not in ("n", "b", "e", "tags")]
        for k, c in keys:
            mark = "✅" if c in ("n", "b", "e", "tags") else "⛔"
            print("   {} {:<12} ⇐ {}()".format(mark, k, c))
        if bad:
            fails += ["المفتاح {} يُبنى بـ{}() — خارج الأربعة".format(k, c) for k, c in bad]

    print("\n③ من حمّل القياس أفصح عنه:")
    loaded = 0
    for w, p in PAGES:
        rel = p if IS_PUBLIC else w
        f = ROOT / rel
        if not f.exists():
            continue
        html = f.read_text(encoding="utf-8", errors="replace")
        if not SCRIPT_REF.search(html):
            continue
        loaded += 1
        if DISCLOSURE.search(html):
            print("   ✅ {:<44} مُفصِح".format(rel))
        else:
            print("   ⛔ {:<44} يُحمِّل القياس بلا إفصاح".format(rel))
            fails.append("{}: يُحمِّل القياس ولا يقول للزائر ماذا يُعدّ".format(rel))
    if not loaded:
        print("   – لم تُركَّب في صفحةٍ بعد. الشرطُ نائمٌ حتى تُركَّب.")

    print("\n④ أداةُ الشيكات تعمل بلا إنترنت — فلا قياسَ فيها:")
    ch = ROOT / (OFFLINE_ONLY[1] if IS_PUBLIC else OFFLINE_ONLY[0])
    if ch.exists():
        if SCRIPT_REF.search(ch.read_text(encoding="utf-8", errors="replace")):
            print("   ⛔ تُحمِّل القياس — ووعدُها أنها تعمل بلا إنترنت")
            fails.append("أداةُ الشيكات تُحمِّل القياس، وذلك ينقض وعدَها")
        else:
            print("   ✅ نظيفة")
    else:
        print("   – غير موجودة هنا")

    print()
    if fails:
        print("⛔ {} إخفاقاً:".format(len(fails)))
        for f in fails:
            print("   •", f)
        return 1
    print("✅ وعدُ الخصوصية محروس.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

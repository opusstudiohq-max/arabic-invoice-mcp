#!/usr/bin/env python3
"""
حارسُ بطاقات المشاركة: كلُّ صفحةٍ منشورة تُعلن صورةً، والصورةُ موجودةٌ فعلاً.

### العيبُ الذي وُلد منه

قِيس في 2 سبتمبر 2026: **og:image غائبٌ عن الصفحات الثماني كلّها.** وثلاثٌ
منها تُعلن `twitter:card = summary_large_image` — أي تَعِد ببطاقةٍ كبيرة ثم
لا تُعطي صورة. فكانت كلُّ مشاركةٍ للرابط تظهر كتلةَ نصٍّ بلا صورة، في سوقٍ
انتشارُه واتساب ولينكدإن.

**ولم يشتكِ شيء.** لأن العيب لا يُرى إلا في *معاينةِ رابطٍ في تطبيقٍ آخر* —
لا في الصفحة، ولا في اختبار، ولا في مراجعةِ نصّ. وهذا بالضبط ما يفحصه هذا
الحارس: الادعاءَ والملفَّ معاً، لا أحدهما.

### أربعة يفحصها

1. كلُّ صفحةٍ منشورة تُعلن `og:image`.
2. كلُّ صورةٍ مُعلنة **موجودةٌ على القرص** — والرابطُ يُحوَّل إلى مسارٍ محلي.
3. من أعلن `summary_large_image` أعلن صورةً — الوعدُ لا يُخلَف.
4. المقاس 1200×630 — وإلا قصّتها المنصّات.

    python tools/check_social_cards.py
"""
from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

from _console import utf8_stdio

utf8_stdio()

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://opusstudiohq-max.github.io/arabic-invoice-mcp/"
WANT = (1200, 630)

#: صفحةٌ منشورة ⇒ (مسارُها هنا، مسارُها في المستودع العام).
#: تُفحص أيُّهما وُجد، فالحارسُ يعمل في المستودعين.
PAGES = [
    ("zatca-qr-benchmark/index.html", "zatca-qr/index.html"),
    ("zatca-qr-benchmark/en/index.html", "zatca-qr/en/index.html"),
    ("pdf-benchmark/index.html", "pdf/index.html"),
    ("tafgeet-benchmark/index.html", "tafgeet/index.html"),
    ("zatca-checker/index.html", "checker/index.html"),
    ("zatca-checker/batch.html", "checker/batch.html"),
    ("invoice-tool/dist/index.html", "invoice/index.html"),
    ("cheque-tool/dist/mutawafiq-cheque.html", "cheque/dist/mutawafiq-cheque.html"),
]

#: القالبُ يُصيَّر بـJekyll، فلا HTML له هنا. يُفحص مصدرُه نصّاً.
LAYOUT = ("pages/_layouts/default.html", "_layouts/default.html")


def png_size(p: Path):
    """المقاس من ترويسة PNG مباشرةً — بلا مكتبة."""
    b = p.read_bytes()[:24]
    if len(b) < 24 or b[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", b[16:24])


def meta(html: str, key: str):
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']' + re.escape(key) + r'["\'][^>]*content=["\']([^"\']*)["\']',
        html, re.I)
    return m.group(1).strip() if m else None


def local_for(url: str, root: Path, public: bool):
    """رابطٌ مطلق ⇒ مسارٌ على القرص. الخريطةُ تنعكس في مستودع العمل."""
    if not url.startswith(BASE):
        return None
    rel = url[len(BASE):]
    if public:
        return root / rel
    inv = {
        "zatca-qr/og.png": "zatca-qr-benchmark/og.png",
        "zatca-qr/en/og.png": "zatca-qr-benchmark/en/og.png",
        "pdf/og.png": "pdf-benchmark/og.png",
        "tafgeet/og.png": "tafgeet-benchmark/og.png",
        "checker/og.png": "zatca-checker/og.png",
        "checker/og-batch.png": "zatca-checker/og-batch.png",
        "invoice/og.png": "invoice-tool/dist/og.png",
        "cheque/dist/og.png": "cheque-tool/dist/og.png",
        "og.png": "pages/og.png",
    }
    return root / inv[rel] if rel in inv else None


def main() -> int:
    public = not (ROOT / "tools" / "sync_public.py").exists()
    print("المستودع:", "العام" if public else "العمل")
    fails: list[str] = []
    seen = 0

    targets = [(w if not public else p) for w, p in PAGES]
    targets.append(LAYOUT[1] if public else LAYOUT[0])

    for rel in targets:
        p = ROOT / rel
        if not p.exists():
            print("  – {:<48} غير موجودة هنا".format(rel))
            continue
        seen += 1
        html = p.read_text(encoding="utf-8", errors="replace")

        img = meta(html, "og:image")
        card = meta(html, "twitter:card")

        # القالب ليبراري: قيمُه من Liquid، فيُفحص الإعلانُ لا الملف
        if rel.endswith("_layouts/default.html"):
            ok = bool(img)
            print(("  ✅ " if ok else "  ⛔ ") + "{:<48} og:image {}".format(
                rel, "مُعلن" if ok else "غائب"))
            if not ok:
                fails.append("{}: القالبُ لا يُعلن og:image".format(rel))
            if card == "summary_large_image" and not img:
                fails.append("{}: يَعِد ببطاقةٍ كبيرة بلا صورة".format(rel))
            continue

        if not img:
            print("  ⛔ {:<48} og:image غائب".format(rel))
            fails.append("{}: og:image غائب".format(rel))
            if card == "summary_large_image":
                fails.append("{}: يُعلن summary_large_image بلا صورة".format(rel))
            continue

        f = local_for(img, ROOT, public)
        if f is None:
            print("  ⛔ {:<48} رابطُ الصورة خارج الموقع: {}".format(rel, img))
            fails.append("{}: og:image لا يشير إلى ملفٍ عندنا".format(rel))
            continue
        if not f.exists():
            print("  ⛔ {:<48} الصورةُ مُعلنةٌ وغيرُ موجودة: {}".format(rel, f.name))
            fails.append("{}: og:image يشير إلى ملفٍ غير موجود ({})".format(rel, f))
            continue

        size = png_size(f)
        if size != WANT:
            print("  ⛔ {:<48} المقاس {} لا {}".format(rel, size, WANT))
            fails.append("{}: مقاسُ البطاقة {} لا {}".format(rel, size, WANT))
            continue

        print("  ✅ {:<48} {}×{}  {:,} بايت".format(rel, size[0], size[1], f.stat().st_size))

    print()
    if not seen:
        print("⛔ لم تُفحص صفحةٌ واحدة — الخريطةُ لا تطابق هذا المستودع.")
        return 1
    if fails:
        print("⛔ {} إخفاقاً:".format(len(fails)))
        for f in fails:
            print("   •", f)
        return 1
    print("✅ {} صفحةً: كلُّها تُعلن بطاقةً، وكلُّ بطاقةٍ موجودةٌ بمقاسها.".format(seen))
    return 0


if __name__ == "__main__":
    sys.exit(main())

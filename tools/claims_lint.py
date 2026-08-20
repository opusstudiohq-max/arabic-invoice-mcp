#!/usr/bin/env python3
"""
claims-lint — بوابة آلية تمنع عودة الادعاءات المحظورة إلى أي أصل يراه العميل.

لماذا هذا الملف موجود:
مرّ المشروع بمراجعتين عدائيتين وحملة تطهير موثقة، ومع ذلك بقيت عبارة تخويف حيّة
على الموقع المنشور، وبقيت نصوص بيع ملغومة جاهزة للنسخ، وكانت ماكينة المحتوى
تعيد توليد ادعاءات مقتولة كل صباح من قوالب لم يطلها التطهير.
السبب الجذري: الخطوط الحمراء كانت تُدار كنصوص في وثائق، لا كفحص آلي.

هذا السكربت يحوّلها إلى بوابة: أي إصابة في مسار عام = فشل.

الاستخدام:
    python tools/claims_lint.py            # يفحص ويطبع تقريراً
    python tools/claims_lint.py --quiet    # مخرجات مختصرة للـCI
مخرج الخروج: 0 نظيف، 1 وُجدت إصابات.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── المسارات التي يراها العميل: المنتج، المحتوى التسويقي، التوثيق، ومخرجات الماكينة ──
SCAN_GLOBS = [
    "checker/**/*.html",
    "checker/**/*.js",
    "checker/**/*.css",
    "checker/**/*.md",
    "README.md",
    "python-lib/README.md",
    "python-lib/index.html",
    "python-lib/CHANGELOG.md",
    "typescript-lib/README.md",
    "_inbox/**/*.md",          ]

# ── وثائق داخلية تقتبس الادعاءات المقتولة عمداً لتوثيقها؛ فحصها يُنتج ضجيجاً ──
EXCLUDE_SUBSTRINGS = [
    "STRATEGY-V5", "BUSINESS-MODEL", "MASTER-REFERENCE", "REVENUE-PLAYBOOK",
    "ADVISOR-REVIEW", "CLAIMS-POLICY", "legal/", "_antigravity/", "_archive/",
    "node_modules", "docs-site/site/", "/dist/", "tools/claims_lint.py",
]

# ── الادعاءات المحظورة: (النمط، سبب الحظر) ──
FORBIDDEN: list[tuple[str, str, str | None]] = [   # (نمط، سبب، استثناء سياقي)
    # أرقام غرامات غير صحيحة — السلّم الحقيقي: إشعار+3 أشهر ثم 1,000/5,000/10,000/40,000
    (r"50[,،]?000", "رقم غرامة غير صحيح — الحد الأقصى الفعلي 40,000 بعد تكرار", None),
    (r"5[,،]?000\s*(?:-|–|إلى|و)\s*50[,،]?000", "نطاق غرامات مختلق", None),
    # دعم حكومي غير مُتحقق منه
    (r"2[,،]?500\s*ريال", "ادعاء دعم حكومي غير مُتحقق منه", None),
    # ادعاءات امتثال مستحيلة — لا أداة محلية تعرف قرار الهيئة
    (r"متوافق\s*(?:100\s*%|بالكامل|تماماً)", "ادعاء امتثال لا يمكن إثباته", None),
    (r"توافق\s*تام", "ادعاء امتثال لا يمكن إثباته", None),
    (r"(?:نضمن|ضمان)\s+(?:لك\s+)?(?:ال)?توافق", "ضمان امتثال مستحيل", None),
    (r"(?:حل|حلنا|أداة|أداتنا|نظام|نظامنا|منتج|منتجنا|خدمة|خدمتنا)\w*\s+معتمدة?\s+من\s+(?:الهيئة|هيئة\s+الزكاة|ZATCA)", "ادعاء اعتماد رسمي كاذب", None),
    (r"(?:QR|كود\s*QR|رمز\s*QR)\s*معتمد", "لا يوجد اعتماد رسمي لرمزنا", None),
    # تسويق بالخوف — ومبادرة إعفاء الغرامات سارية حتى 31 ديسمبر 2026
    (r"قبل\s+(?:أن\s+تصلك\s+)?الغرام", "تسويق بالخوف — مبادرة الإعفاء سارية", None),
    (r"الغرامات\s+سارية", "غير دقيق أثناء نافذة الإعفاء", r"إعفاء|إلغاء\s+الغرامات|مُمدَّدة"),
    (r"تفادي\s+غرامات\s+Wave\s*24", "الموجة 24 مضى موعدها؛ وتخويف", None),
    (r"Wave\s*24\s+إلزامي\s+عليك", "غير دقيق — الموعد مضى", None),
    # تعليمات لا تعمل
    (r"pip\s+install\s+arabic-invoice-mcp(?!\S)", "الحزمة غير منشورة على PyPI (404)", None),
    # توقعات دخل مقتولة في الاستراتيجية
    (r"\$\s*5[,.]?000\s*-\s*\$?\s*10[,.]?000", "توقع دخل مقتول في STRATEGY-V5", None),
]

COMPILED = [(re.compile(p), why, re.compile(unless) if unless else None)
            for p, why, unless in FORBIDDEN]


def is_excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    return any(token in rel for token in EXCLUDE_SUBSTRINGS)


def scan() -> list[tuple[str, int, str, str]]:
    """يرجع قائمة (المسار، رقم السطر، سبب الحظر، نص السطر)."""
    hits: list[tuple[str, int, str, str]] = []
    seen: set[Path] = set()
    for pattern in SCAN_GLOBS:
        for path in ROOT.glob(pattern):
            if not path.is_file() or path in seen or is_excluded(path):
                continue
            seen.add(path)
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except (UnicodeDecodeError, OSError):
                continue
            for idx, line in enumerate(lines, 1):
                # إعفاء صريح مبرَّر: على السطر نفسه أو في تعليق فوقه مباشرة
                prev = lines[idx - 2] if idx >= 2 else ""
                if "claims-lint: allow" in line or "claims-lint: allow" in prev:
                    continue
                for rx, why, unless in COMPILED:
                    if rx.search(line) and not (unless and unless.search(line)):
                        hits.append((path.relative_to(ROOT).as_posix(), idx, why, line.strip()[:130]))
                        break
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="فحص الادعاءات المحظورة في الأصول العامة")
    ap.add_argument("--quiet", action="store_true", help="مخرجات مختصرة")
    args = ap.parse_args()

    hits = scan()
    if not hits:
        print("claims-lint: OK — لا ادعاءات محظورة في الأصول العامة.")
        return 0

    print(f"claims-lint: FAILED — {len(hits)} إصابة\n")
    for path, line_no, why, text in hits:
        print(f"  {path}:{line_no}")
        print(f"    السبب : {why}")
        if not args.quiet:
            print(f"    السطر : {text}")
        print()
    print("أصلح الإصابات، أو أضف تعليق «claims-lint: allow» على السطر مع مبرر مكتوب.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

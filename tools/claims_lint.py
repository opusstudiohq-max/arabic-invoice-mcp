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
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── النطاق: كل شيء، إلا ما استُثني صراحةً ────────────────────────────────
#
# كانت هنا قائمةُ مساراتٍ بيضاء. وقد تسرّب منها **أربع مرات**: ملفُ الملف
# الشخصي، ثم `deployment-kit`، ثم `tafgeet-benchmark/**/*.md`، ثم READMEات
# الحزم. وفي كل مرة كان السطح عاماً والبوابة تقول «نظيف» — لأن الملف لم
# يكن مفحوصاً أصلاً، لا لأنه سليم.
#
# والعلّة بنيوية لا بشرية: **قائمةٌ بيضاء تُخفق بالصمت.** فمن نسي مساراً
# لم ير شيئاً. فقُلبت القاعدة: يُفحص كل ما يمكن أن يُنشر، ويُستثنى
# الداخليّ صراحةً في `EXCLUDE_SUBSTRINGS`. ونسيانُ استثناءٍ يُنتج **ضجيجاً**
# — وهو إخفاقٌ مرئيّ يُصلَح، لا صمتٌ يُطمئن كذباً.
SCAN_GLOBS = [
    "**/*.md",
    "**/*.html",
    "**/*.js",
    "**/*.mjs",
    "**/*.css",
]

# القائمة البيضاء السابقة، محفوظة لأن اختباراً يفرض ألا يضيق النطاق عمّا كان.
LEGACY_SCAN_GLOBS = [
    "tafgeet-benchmark/**/*.html",
    "tafgeet-benchmark/**/*.js",
    # كان README المقياس خارج النطاق رغم أنه يُنشر مع المستودع العام — كشفه
    # اختبارُ حقنٍ لا قراءةُ ملف. الامتداد المفقود ثغرةٌ صامتة بطبعها.
    "tafgeet-benchmark/**/*.md",
    "cheque-tool/**/*.html",
    "cheque-tool/**/*.js",
    "cheque-tool/**/*.md",
    "zatca-checker/**/*.html",
    "zatca-checker/**/*.js",
    "zatca-checker/**/*.css",
    "zatca-checker/**/*.md",
    "README.md",
    "arabic-invoice-mcp/README.md",
    "arabic-invoice-mcp/index.html",
    "arabic-invoice-mcp/CHANGELOG.md",
    "arabic-invoice-mcp-ts/README.md",
    # كل README حزمة يُنشر مع الحزمة — سطحٌ عام كأي سطح
    "eta-lib/README.md",
    "eta-lib/ts/README.md",
    "arabic-text/README.md",
    "invoice-pdf/README.md",
    "marketing/**/*.md",
    # كانت ثلاثة أنماط فقط، فبقيت أربعة ملفات خارج الحراسة — منها mostaql-profile.md
    # وهو نصّ الملف الشخصي الذي يُلصق على المنصة حرفياً. سطحٌ يراه العميل خارج
    # البوابة ليس «نظيفاً»، هو غير مفحوص. الحزمة كلها الآن داخل النطاق.
    "deployment-kit/*.md",
    "docs-site/docs/**/*.md",
    "brand/**/*.md",
    "_inbox/**/*.md",          # مخرجات الوكلاء اليومية — تُفحص قبل أن تُرسل
]

# ── وثائق داخلية تقتبس الادعاءات المقتولة عمداً لتوثيقها؛ فحصها يُنتج ضجيجاً ──
#
# شرط العضوية هنا واحد: **ألا يصل الملف عميلاً بأي طريق** — لا في مستودع
# عام، ولا على صفحة، ولا في نصّ يُلصق أو يُقال. وما شككتَ فيه فاتركه
# مفحوصاً: كلفةُ الضجيج سطرٌ يُصلَح، وكلفةُ الصمت ادعاءٌ منشور.
EXCLUDE_SUBSTRINGS = [
    "STRATEGY-V5", "BUSINESS-MODEL", "MASTER-REFERENCE", "REVENUE-PLAYBOOK",
    "ADVISOR-REVIEW", "CLAIMS-POLICY", "legal/", "_antigravity/", "_archive/",
    "node_modules", "docs-site/site/", "tools/claims_lint.py",
    # ناتج ترجمة TypeScript — مصدره مفحوص، ونسخته المترجَمة ضجيج مكرَّر.
    # ولا يُستثنى `dist` عامةً: `cheque-tool/dist/` هو **الأداة المشحونة**
    # نفسها، ملفٌ واحد يُرسَل للمستعمل — وإخفاؤه كان يُعيد العلّة عينها.
    "arabic-invoice-mcp-ts/dist/", "eta-lib/ts/dist/", "arabic-text/dist/",
    "typescript-lib/dist/", "nasq/dist/",
    # سجلّات قرارٍ ومراجعةٍ وبحث — تقتبس الادعاء المقتول لتوثّق قتله
    "AUDIT-", "DECISION-", "CEO-DECISIONS", "METHODOLOGY", "ROADMAP",
    "AI-MACHINE-DESIGN", "V3_MASTER_PLAN", "SESSION-", "PRODUCT-DISCOVERY",
    "القرار_", "دراسة_", "research/", "_inbox/ARCHIVE", "GITHUB-CODE",
    # مقارير الوكلاء الخام قبل المراجعة، ومخرجات البناء
    "/cache/", "/coverage/", "/.venv/", "/build/",
]

# مجلدات تُقلَّم قبل الدخول إليها — لا لأنها تُستثنى فقط، بل لأن الدخول
# نفسه مكلف أو خطر (مسارات تتجاوز حدّ الطول في ويندوز).
# ولا يُقلَّم `dist`: فيه **الأداة المشحونة** (`cheque-tool/dist/…html`
# و`invoice/`)، وإخفاؤها يُعيد العلّة التي قُلبت القائمة من أجلها.
# ما يُقلَّم هنا ما لا يُنشر أصلاً، أو ما يخطر المرورُ به:
# `node_modules` مسارٌ يتجاوز حدّ الطول في ويندوز، والباقي مخرَجات أدوات.
PRUNED_DIRS = {
    "node_modules", ".git", "__pycache__",
    ".venv", "venv", ".pytest_cache", ".mypy_cache", ".ruff_cache",
}

# ── الادعاءات المحظورة: (النمط، سبب الحظر) ──
FORBIDDEN: list[tuple[str, str, str | None]] = [   # (نمط، سبب، استثناء سياقي)
    # سلالم الغرامات متعددة وتختلف باختلاف المخالفة [ZATCA — دليل تصنيف المخالفات،
    # قسم لائحة الفوترة الإلكترونية، البنود 8-17؛ مُستخرَج ومقروء 2026-08-21]:
    #   QR مفقود           : تنبيه ← 1,000 ← 5,000 ← 10,000 ← 20,000 ← 30,000 ← 40,000
    #   عدم إصدار/مشاركة   : تنبيه ← 5,000 ← 10,000 ← 15,000 ← 20,000 ← 30,000 ← 40,000
    #   عدم ربط الأنظمة    : تنبيه ← 10,000 ← 15,000 ← 20,000 ← 30,000 ← 40,000 ← 50,000
    #
    # كانت هنا قاعدة تمنع 50,000 مطلقاً بحجة «الأقصى الفعلي 40,000» — وهي خاطئة:
    # 50,000 سقف صحيح لمخالفة عدم الربط. بوابةٌ تكبت رقماً صحيحاً أسوأ من غياب
    # البوابة، لأنها تُكسب الخطأ ثقةً. الممنوع هو الرقم **منسوباً لمخالفة QR**،
    # فتلك سقفها 40,000 — وهي المخالفة الوحيدة التي تخص أداتنا.
    #
    # وثانيةً: القاعدة كبتت جملةً صحيحة. سطرٌ في ROADMAP يذكر **السقفين
    # معاً على صوابهما** — «سقف مخالفة QR 40,000، وسقف عدم الربط 50,000» —
    # فأصابته القاعدة لمجرّد تجاور الكلمتين. والدرس هو الدرس نفسه: من نسب
    # الـ50,000 إلى **عدم الربط** صراحةً فقد قال الصواب، فيمرّ.
    (r"(?:رمز|QR|الاستجابة\s+السريعة)[^.\n]{0,80}50[,،]?000",
     "50,000 ليست سقف مخالفة QR — سقفها 40,000؛ الـ50,000 لمخالفة عدم الربط",
     ATTRIBUTED_TO_LINKING := r"(?:عدم\s+)?الربط[^.\n]{0,30}50[,،]?000"
                              r"|50[,،]?000[^.\n]{0,30}(?:لـ?مخالفة\s+)?(?:عدم\s+)?الربط"),
    (r"50[,،]?000[^.\n]{0,80}(?:رمز|QR|الاستجابة\s+السريعة)",
     "50,000 ليست سقف مخالفة QR — سقفها 40,000؛ الـ50,000 لمخالفة عدم الربط",
     ATTRIBUTED_TO_LINKING),
    # والصيغة المفردة كانت تفلت: القاعدة أدناه كانت «الغرامات سارية» جمعاً فقط،
    # بينما نص gigs يقول «غرامة سارية». قِيس وأُثبت الإفلات قبل التوسيع.
    (r"(?:الغرامات|غرامة|الغرامة)\s+سارية", "غير دقيق أثناء نافذة الإعفاء",
     r"إعفاء|إلغاء\s+الغرامات|مُمدَّدة"),
    (r"5[,،]?000\s*(?:-|–|إلى|و)\s*50[,،]?000", "نطاق غرامات مختلق", None),
    # دعم حكومي غير مُتحقق منه
    (r"2[,،]?500\s*ريال", "ادعاء دعم حكومي غير مُتحقق منه", None),
    # ادعاءات امتثال مستحيلة — لا أداة محلية تعرف قرار الهيئة
    (r"متوافق\s*(?:100\s*%|بالكامل|تماماً)", "ادعاء امتثال لا يمكن إثباته", None),
    (r"توافق\s*تام", "ادعاء امتثال لا يمكن إثباته", None),
    # الثغرة التي أفلتت فعلاً: القاعدتان أعلاه تمنعان الصيغ المشدَّدة فقط، بينما
    # «افحص توافق فاتورتك» في H1 الصفحة وعد بحكم توافق — والأداة لا تملكه أصلاً
    # (حالة القبول حدث خادمي لدى الهيئة). الاستثناء لنفيٍ صريح في السطر نفسه.
    (r"(?:ا)?فحص\s+توافق", "وعد بحكم توافق لا تملكه الأداة — قل «فحص بنية»",
     r"لا\s+(?:يمكن|تؤكد|يؤكد)|ليس\s+فحص|بنيوي\s+فقط"),
    (r"(?:نضمن|ضمان)\s+(?:لك\s+)?(?:ال)?توافق", "ضمان امتثال مستحيل", None),
    (r"(?:حل|حلنا|أداة|أداتنا|نظام|نظامنا|منتج|منتجنا|خدمة|خدمتنا)\w*\s+معتمدة?\s+من\s+(?:الهيئة|هيئة\s+الزكاة|ZATCA)", "ادعاء اعتماد رسمي كاذب", None),
    (r"(?:QR|كود\s*QR|رمز\s*QR)\s*معتمد", "لا يوجد اعتماد رسمي لرمزنا", None),
    # تسويق بالخوف — ومبادرة إعفاء الغرامات سارية حتى 31 ديسمبر 2026
    (r"قبل\s+(?:أن\s+تصلك\s+)?الغرام", "تسويق بالخوف — مبادرة الإعفاء سارية", None),
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


def iter_public_files():
    """
    كل ملف داخل نطاق الفحص، مرةً واحدة.

    كان هذا الدوران مكرَّراً في كل فحص على حدة — ومعنى ذلك أن توسيع النطاق
    يجب أن يُكرَّر بعدد الفحوص، وأن نسيان واحدٍ يترك فحصاً أضيق من إخوته
    بلا أثر ظاهر. مصدرٌ واحد للنطاق يجعل ذلك مستحيلاً.
    """
    # **التقليم أثناء المرور لا بعده.** كان الفحص يستعمل `Path.glob`، وهي
    # تدخل كل مجلد ثم يُستبعد ما يُستبعد — فانهارت على مسارٍ داخل
    # `node_modules` تجاوز حدّ الطول في ويندوز:
    #     FileNotFoundError: [WinError 3] … _class_check_private_static_field
    # ولا علاقة للحدّ بنا: نحن لا نفحص تلك الملفات أصلاً، وإنما دخلناها.
    suffixes = {"." + g.rsplit(".", 1)[-1] for g in SCAN_GLOBS if "." in g}
    seen: set[Path] = set()
    for folder, subdirs, files in os.walk(ROOT):
        here = Path(folder)
        subdirs[:] = [d for d in subdirs
                      if d not in PRUNED_DIRS and not is_excluded(here / d)]
        for name in files:
            path = here / name
            if path.suffix not in suffixes or path in seen or is_excluded(path):
                continue
            seen.add(path)
            yield path


def scan() -> list[tuple[str, int, str, str]]:
    """يرجع قائمة (المسار، رقم السطر، سبب الحظر، نص السطر)."""
    hits: list[tuple[str, int, str, str]] = []
    for path in iter_public_files():
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


TEST_COUNT_RE = re.compile(r"(\d{2,4})\s*(?:اختبار|اختباراً|اختبارًا|automated tests|tests)")

#: سطرٌ يُسمّي حزمةً بعينها — فعدده يخصّها لا يخصّ المشروع.
NAMES_A_PACKAGE = re.compile(
    r"`[\w./-]+/`"                        # مسار بين علامتَي كود: `fatura/`
    r"|\b(?:nasq|fatura|eta-lib|python-lib|typescript-lib|arabic-text"
    r"|invoice-pdf|arabic-invoice-mcp|tafgeet-benchmark|مُتوافِق)\b"
)


# حزمٌ لكلٍّ منها حزمة اختبارات مستقلة وعددٌ خاص. عدُّها لا يُقارن بعدّ
# المشروع ولا بعدّ أختها — يحرسه اختبارٌ **داخلها** يقرأ رقم README ويقارنه
# بالواقع. أمّا الأصول خارج هذه الجذور فتتكلم عن حزمة المشروع كلها، ويجب
# أن تتفق على رقم واحد.
PACKAGE_ROOTS = (
    "eta-lib/", "arabic-text/", "invoice-pdf/", "invoice-tool/", "tafgeet-benchmark/",
    # أسماء المجلدات نفسها في المستودع العام — نسخة البوابة واحدة في الاثنين
    "nasq/", "fatura/", "invoice/", "invoice-tool/", "tafgeet/", "typescript-lib/", "python-lib/", "checker/",
)


def check_test_counts(expected: int | None = None) -> list[str]:
    """
    عدد الاختبارات ادعاء كأي ادعاء آخر — وقد انجرف مرتين (160 مقابل 176).
    نتحقق من شيئين: أن كل الأصول تقول الرقم نفسه، وأنه يطابق الواقع إن مُرِّر.

    والمقارنة **داخل الموضوع الواحد**: لكل حزمة عدُّها، ولا معنى لأن يُفشل
    «٢٤ اختباراً» في حزمة نصوصٍ رقمَ «١٧٦ اختباراً» في المشروع. وقاعدةٌ
    تُفشل صواباً تُكسب الخطأ ثقة البوابة — وهذا الدرس مدفوعُ الثمن هنا.
    """
    found: dict[int, list[str]] = {}
    for path in iter_public_files():
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(PACKAGE_ROOTS):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line in text.splitlines():
            for m in TEST_COUNT_RE.finditer(line):
                n = int(m.group(1))
                if n < 20:          # أرقام صغيرة غالباً ليست عدّ حزمة اختبارات
                    continue
                # عددٌ منسوبٌ إلى حزمة بعينها في السطر نفسه ليس ادعاءً عن
                # المشروع. صفحةٌ تعدّد حزمها في جدول تقول «38» لهذه و«183»
                # لتلك — وكلاهما صواب. وقاعدةٌ تُفشل الصواب تُكسب الخطأ ثقتها.
                if NAMES_A_PACKAGE.search(line):
                    continue
                found.setdefault(n, []).append(rel)

    problems: list[str] = []
    if len(found) > 1:
        detail = " | ".join(f"{n}: {sorted(set(f))[:3]}" for n, f in sorted(found.items()))
        problems.append(f"أعداد اختبارات متضاربة عبر الأصول — {detail}")
    if expected is not None:
        for n, files in found.items():
            if n != expected:
                problems.append(
                    f"الأصول تعلن {n} اختباراً والواقع {expected} — {sorted(set(files))[:3]}"
                )
    return problems


def check_facts_registry(facts_path: Path | None = None, today=None) -> list[str]:
    """
    الحقيقة التنظيمية المتقادمة تصبح مستحيلة بنيوياً لا مجرد مستبعدة:
    أي حقيقة في FACTS.json تجاوزت recheck_by أو expires_on تُفشل البوابة
    حتى يُعاد التحقق منها ويُحدَّث السجل باليد. (المشروع حُرق ثلاث مرات
    بحقائق تقادمت صامتة — هذا القفل ثمرة ذلك الدرس.)
    """
    import datetime
    import json

    facts_path = facts_path or ROOT / "FACTS.json"
    today = today or datetime.date.today()
    if not facts_path.exists():
        # غياب السجل يعطّل القفل كله بصمت — لذلك الغياب نفسه فشل
        return [f"سجل الحقائق {facts_path.name} غير موجود — القفل الزمني للحقائق معطّل"]
    try:
        facts = json.loads(facts_path.read_text(encoding="utf-8")).get("facts", [])
    except (OSError, ValueError) as e:
        return [f"تعذر قراءة {facts_path.name}: {e}"]

    problems: list[str] = []
    for fact in facts:
        fact_id = fact.get("id", "؟")
        try:
            expires = fact.get("expires_on")
            if expires and today > datetime.date.fromisoformat(expires):
                problems.append(
                    f"الحقيقة «{fact_id}» انتهت صلاحيتها في {expires} — "
                    f"راجع ما ينشرها: {fact.get('published_in', [])}"
                )
                continue
            recheck = fact.get("recheck_by")
            if recheck and today > datetime.date.fromisoformat(recheck):
                problems.append(
                    f"الحقيقة «{fact_id}» تجاوزت موعد إعادة الفحص ({recheck}) — "
                    "أعد التحقق من مصدرها وحدّث verified_on/recheck_by في FACTS.json"
                )
        except (TypeError, ValueError):
            problems.append(f"الحقيقة «{fact_id}»: تاريخ غير صالح في recheck_by/expires_on")
    return problems



# ── ادعاءات التوزيع: «منشور» صفةٌ تُتحقَّق، لا تُكتب ──────────────────────
#
# `npm i X` أو `X على npm` — اسمٌ صريح، يُطابَق بالسجل.
INSTALL_RE = re.compile(
    r"(?:npm\s+(?:i|install|add)|npx)\s+(?:-[\w-]+\s+)*([@\w][\w./@-]*)"
    r"|registry\.npmjs\.org/([@\w][\w./@-]*)"
    r"|npmjs\.com/package/([@\w][\w./@-]*)"
)
PIP_RE = re.compile(r"pip\s+install\s+(?:-[\w-]+\s+)*([\w][\w.\[\]-]*)")
# ادعاء مُرسَل بلا اسم: «حزمتنا على npm»، «منشورة على npm»
VAGUE_NPM_RE = re.compile(r"(?:حزمتنا|حزمتُنا|مكتبتنا|نسختنا)[^\n]{0,40}على\s+npm"
                          r"|our\s+(?:package|library)[^\n]{0,30}on\s+npm")
VAGUE_PYPI_RE = re.compile(r"(?:حزمتنا|مكتبتنا)[^\n]{0,40}على\s+(?:PyPI|pypi)")


def check_distribution_claims(registry_path: Path | None = None) -> list[str]:
    """
    كل ادعاء توزيع في أصل عام يجب أن يقابله مدخل في PUBLISHED.json.

    السبب: صفحة المقياس المنشورة قالت «حزمتنا على npm» ولا شيء لنا على npm.
    المعنى كان صحيحاً — البناء المشحون أخفق 38% — والصفة كاذبة. ولم تكشفه
    مراجعة نصّ، لأن القراءة لا تُظهر غياب شيء؛ كشفه استعلامُ السجلّ نفسه.

    ولا يُفحص إلا ما نملك اسمه: `npm i pdf-lib` في مثال توثيقي ليس ادعاءً
    عنّا، وحجبُه يجعل البوابة تكذب في الاتجاه المضاد.
    """
    import json

    registry_path = registry_path or ROOT / "PUBLISHED.json"
    if not registry_path.exists():
        return [f"سجل النشر {registry_path.name} غير موجود — بوابة ادعاءات التوزيع معطّلة"]
    try:
        reg = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"تعذر قراءة {registry_path.name}: {e}"]

    ours = {n.lower() for n in reg.get("our_names", [])}
    npm_names = {e.get("name", "").lower() for e in reg.get("npm", [])}
    pypi_names = {e.get("name", "").lower() for e in reg.get("pypi", [])}

    problems: list[str] = []
    for path in iter_public_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = path.relative_to(ROOT).as_posix()
        lines = text.splitlines()
        for line_no, line in enumerate(lines, 1):
            # الإعفاء على السطر نفسه أو في تعليق فوقه مباشرة — كما في scan()،
            # فبوابةٌ تقبل الإعفاء في موضع وترفضه في آخر تُربك أكثر مما تحرس
            prev = lines[line_no - 2] if line_no >= 2 else ""
            if "claims-lint: allow" in line or "claims-lint: allow" in prev:
                continue
            for m in INSTALL_RE.finditer(line):
                name = (m.group(1) or m.group(2) or m.group(3) or "").lower().rstrip(".,;)")
                if name in ours and name not in npm_names:
                    problems.append(
                        f"{rel}:{line_no} يوجّه إلى تثبيت «{name}» من npm وهي ليست في "
                        f"PUBLISHED.json.npm — انشرها أولاً أو احذف التوجيه"
                    )
            for m in PIP_RE.finditer(line):
                name = m.group(1).lower().rstrip(".,;)")
                if name in ours and name not in pypi_names:
                    problems.append(
                        f"{rel}:{line_no} يوجّه إلى تثبيت «{name}» من PyPI وهي ليست في "
                        f"PUBLISHED.json.pypi"
                    )
            if VAGUE_NPM_RE.search(line) and not npm_names:
                problems.append(
                    f"{rel}:{line_no} يدّعي أن لنا حزمة على npm وسجلّ النشر خالٍ من ذلك"
                )
            if VAGUE_PYPI_RE.search(line) and not pypi_names:
                problems.append(
                    f"{rel}:{line_no} يدّعي أن لنا حزمة على PyPI وسجلّ النشر خالٍ من ذلك"
                )
    return problems


def check_package_dependencies(registry_path: Path | None = None) -> list[str]:
    """
    تبعيةٌ باسمٍ من أسمائنا وبمدى نسخٍ تعني «هذه على npm» — وهي إن لم تكن
    منشورة **تكسر `npm install` عند كل من ينسخ المستودع**.

    وقد وقعت: `fatura` أعلنت `"nasq": "^0.1.0"` ولم يظهر شيء، لأن وصلةً
    رمزية متبقّية من تثبيتٍ سابق كانت تحلّها عندنا وحدنا. والتصريح الصادق
    `file:../…` — أو النشرُ الفعلي.

    ولا تُفحص هنا إلا **أسماؤنا**: `"pdf-lib": "^1.17.1"` تبعيةٌ سليمة.
    """
    import json

    registry_path = registry_path or ROOT / "PUBLISHED.json"
    if not registry_path.exists():
        return [f"سجل النشر {registry_path.name} غير موجود"]
    reg = json.loads(registry_path.read_text(encoding="utf-8"))
    ours = {n.lower() for n in reg.get("our_names", [])}
    published = {e.get("name", "").lower() for e in reg.get("npm", [])}

    problems: list[str] = []
    for folder, subdirs, files in os.walk(ROOT):
        here = Path(folder)
        subdirs[:] = [d for d in subdirs if d not in PRUNED_DIRS]
        if "package.json" not in files:
            continue
        path = here / "package.json"
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        rel = path.relative_to(ROOT).as_posix()
        for section in ("dependencies", "devDependencies", "peerDependencies"):
            for name, spec in (manifest.get(section) or {}).items():
                if name.lower() not in ours or name.lower() in published:
                    continue
                if not str(spec).startswith(("file:", "link:", "workspace:", "portal:")):
                    problems.append(
                        f"{rel} يعلن «{name}»: «{spec}» — والحزمة ليست على npm، "
                        f"فـ`npm install` نظيف يفشل. استعمل `file:` أو انشرها"
                    )
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="فحص الادعاءات المحظورة في الأصول العامة")
    ap.add_argument("--quiet", action="store_true", help="مخرجات مختصرة")
    ap.add_argument("--expect-tests", type=int, default=None,
                    help="عدد الاختبارات الفعلي (من pytest) للتحقق من مطابقة الأصول له")
    ap.add_argument("--skip-facts", action="store_true",
                    help="تجاوز قفل صلاحية FACTS.json (للطوارئ فقط — الوضع الطبيعي أن يعمل)")
    args = ap.parse_args()

    hits = scan()
    count_problems = check_test_counts(args.expect_tests)
    facts_problems = [] if args.skip_facts else check_facts_registry()
    dist_problems = check_distribution_claims() + check_package_dependencies()
    if dist_problems:
        print("claims-lint: ادعاء توزيع بلا سجلّ نشر (PUBLISHED.json)\n")
        for pr in dist_problems:
            print("  •", pr)
        print()
    if facts_problems:
        print("claims-lint: حقائق تنظيمية خارج نافذة الصلاحية (FACTS.json)\n")
        for pr in facts_problems:
            print("  •", pr)
        print()
    if count_problems:
        print("claims-lint: انجراف في عدد الاختبارات المعلن\n")
        for pr in count_problems:
            print("  •", pr)
        print()

    if not hits and not count_problems and not facts_problems and not dist_problems:
        print("claims-lint: OK — لا ادعاءات محظورة في الأصول العامة.")
        return 0

    if hits:
        print(f"claims-lint: FAILED — {len(hits)} إصابة\n")
    for path, line_no, why, text in hits:
        print(f"  {path}:{line_no}")
        print(f"    السبب : {why}")
        if not args.quiet:
            print(f"    السطر : {text}")
        print()
    if hits:
        print("أصلح الإصابات، أو أضف تعليق «claims-lint: allow» على السطر مع مبرر مكتوب.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

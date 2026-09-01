#!/usr/bin/env python3
"""
يُولّد صورة البرهان: السطر نفسه، مرسوماً بمحرّكين، مُصيَّراً من ملفَي PDF.

### لماذا صورة لا نصّ

الصفحة تُعرض في متصفّح، والمتصفّح **عارضٌ مطابق لخوارزمية يونيكود**. فأيّ
سلسلةٍ مكسورة نضعها فيه نصّاً قد يُعيد ترتيبها فيُصلحها بصرياً — وتضيع
البرهنة نفسها. جرّبنا `unicode-bidi:bidi-override` فلم نستطع الجزم بالنظر
أن ما ظهر هو ما في الملف.

فالبرهان الوحيد الذي لا يُنازَع: **تصيير ملفَي PDF الفعليين إلى صورة.**

    python pdf-benchmark/evidence.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "evidence.png"

RENDER = r"""
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawArabicText } from "nasq/pdf-lib";

const TEXT = "الإجمالي 1,234.50 ج.م";
const font = fs.readFileSync(process.argv[2]);

async function page(draw) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const embedded = await doc.embedFont(font, { subset: false });
  const p = doc.addPage([420, 70]);
  draw(p, embedded);
  return doc.save();
}

fs.writeFileSync(process.argv[3],
  await page((p, f) => p.drawText(TEXT, { x: 24, y: 26, size: 22, font: f })));
fs.writeFileSync(process.argv[4],
  await page((p, f) => drawArabicText(p, TEXT,
    { font: f, size: 22, x: 24, y: 26, align: "left", base: "rtl" })));
"""


def main() -> int:
    font = next((p for p in [
        HERE.parent / "invoice-tool" / "fonts" / "Almarai.ttf",
        HERE.parent / "invoice" / "fonts" / "Almarai.ttf",
    ] if p.exists()), None)
    if font is None:
        print("✖ الخطّ غير موجود")
        return 1

    script = HERE / "_evidence.mjs"
    script.write_text(RENDER, encoding="utf-8")
    broken, fixed = HERE / "_broken.pdf", HERE / "_fixed.pdf"
    try:
        run = subprocess.run(
            ["node", str(script), str(font), str(broken), str(fixed)],
            cwd=HERE, capture_output=True, text=True, encoding="utf-8", timeout=120)
        if run.returncode != 0:
            print("✖ تعذّر بناء الملفين:\n" + (run.stderr or "")[-500:])
            return 1

        try:
            import pypdfium2 as pdfium
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            print("✖ يلزم pypdfium2 وPillow:  pip install pypdfium2 pillow")
            return 1

        scale = 2.4
        tiles = []
        for path in (broken, fixed):
            # يُغلق المستند صراحةً: pdfium يُبقي الملف مفتوحاً على ويندوز
            # فيمنع حذفه، ويسقط التنظيف بـPermissionError.
            document = pdfium.PdfDocument(str(path))
            tiles.append(document[0].render(scale=scale).to_pil())
            document.close()

        # العناوين بخطٍّ قابل للقراءة — الخطّ المبدئي في Pillow صغير جداً
        try:
            caption_font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 21)
        except OSError:
            caption_font = ImageFont.load_default()

        pad, label = 20, 40
        width = max(t.width for t in tiles) + pad * 2
        height = sum(t.height + label for t in tiles) + pad * (len(tiles) + 1)
        canvas = Image.new("RGB", (width, height), "white")
        pen = ImageDraw.Draw(canvas)

        y = pad
        for tile, caption, colour in zip(
            tiles,
            ["pdf-lib as-is — the amount reverses",
             "nasq — the amount reads as written"],
            [(180, 35, 42), (10, 125, 90)],
        ):
            pen.text((pad, y), caption, fill=colour, font=caption_font)
            y += label
            canvas.paste(tile, (pad, y))
            pen.rectangle([pad - 1, y - 1, pad + tile.width, y + tile.height],
                          outline=(224, 230, 236))
            y += tile.height + pad

        canvas.save(OUT, optimize=True)
        print(f"✓ {OUT.name}  {canvas.width}×{canvas.height}  "
              f"{OUT.stat().st_size / 1024:.1f} KB")
        return 0
    finally:
        for temp in (script, broken, fixed):
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())

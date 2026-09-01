/**
 * التسلسل الكنسي لمستندات الفاتورة الإلكترونية المصرية (ETA) — TypeScript.
 *
 * **لماذا نسخة TypeScript:** القياس وجد **صفر حزمة npm** لمنظومة ETA،
 * بينما لتايوان ونيجيريا وأوروبا حزم قائمة. والمرجع الرسمي `EInvoicingSigner`
 * مهجور منذ يناير 2024 بـ63 نسخة مشتقة — أي 63 فريقاً لم يجدوا بديلاً.
 *
 * ### الفخّ الذي يفرض محلّلاً خاصاً
 *
 * المواصفة تُلزم بأخذ القيمة **بشكلها اللفظي**: `0.0` تبقى `0.0` ولا تصير
 * `0` ولا `0.00`. و`JSON.parse` يحوّلها إلى `number` فيضيع الشكل نهائياً —
 * `JSON.parse("0.0")` و`JSON.parse("0.00")` كلاهما `0`، ولا سبيل لاستعادة
 * الأصل. فيختلف الهاش عن هاش الهيئة **ويُرفض المستند بلا تشخيص**.
 *
 * ولذلك يحمل هذا الملف **محلّل JSON صغيراً** يحفظ نصّ كل رقم كما كُتب.
 * لا اعتماد على `JSON.parse` ولا على ميزات Node حديثة.
 *
 * ### التحقق
 *
 * `tests/parity.test.mjs` يقارن مخرَج هذه النسخة بنسخة بايثون المرجعية،
 * وكلتاهما تُطابق الملف الرسمي `one-doc-serialized.json.txt` بايتاً ببايت.
 */

/** قيمة مُحلَّلة: الأرقام والقيم المنطقية تصل **نصّاً** كما كُتبت. */
export type EtaValue = string | EtaObject | EtaValue[];
export interface EtaObject {
  [key: string]: EtaValue;
}

class JsonTextParser {
  private i = 0;

  constructor(private readonly src: string) {}

  parse(): EtaValue {
    this.ws();
    const value = this.value();
    this.ws();
    if (this.i < this.src.length) {
      throw new SyntaxError(`محارف زائدة بعد نهاية المستند عند ${this.i}`);
    }
    return value;
  }

  private ws(): void {
    while (this.i < this.src.length && " \t\n\r".includes(this.src[this.i])) this.i++;
  }

  private expect(ch: string): void {
    if (this.src[this.i] !== ch) {
      throw new SyntaxError(`توقّعت «${ch}» عند ${this.i} فوجدت «${this.src[this.i] ?? "نهاية"}»`);
    }
    this.i++;
  }

  private value(): EtaValue {
    const ch = this.src[this.i];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === '"') return this.string();
    return this.literal();
  }

  private object(): EtaObject {
    this.expect("{");
    const out: EtaObject = {};
    this.ws();
    if (this.src[this.i] === "}") { this.i++; return out; }
    for (;;) {
      this.ws();
      const key = this.string();
      this.ws();
      this.expect(":");
      this.ws();
      out[key] = this.value();          // الترتيب محفوظ — وهو جزء من الهاش
      this.ws();
      if (this.src[this.i] === ",") { this.i++; continue; }
      this.expect("}");
      return out;
    }
  }

  private array(): EtaValue[] {
    this.expect("[");
    const out: EtaValue[] = [];
    this.ws();
    if (this.src[this.i] === "]") { this.i++; return out; }
    for (;;) {
      this.ws();
      out.push(this.value());
      this.ws();
      if (this.src[this.i] === ",") { this.i++; continue; }
      this.expect("]");
      return out;
    }
  }

  private string(): string {
    this.expect('"');
    let out = "";
    for (;;) {
      const ch = this.src[this.i];
      if (ch === undefined) throw new SyntaxError("نصّ غير مغلق");
      if (ch === '"') { this.i++; return out; }
      if (ch === "\\") {
        this.i++;
        const esc = this.src[this.i++];
        const simple: Record<string, string> = {
          '"': '"', "\\": "\\", "/": "/", b: "\b",
          f: "\f", n: "\n", r: "\r", t: "\t",
        };
        if (esc in simple) { out += simple[esc]; continue; }
        if (esc === "u") {
          out += String.fromCharCode(parseInt(this.src.slice(this.i, this.i + 4), 16));
          this.i += 4;
          continue;
        }
        throw new SyntaxError(`هروب غير معروف \\${esc} عند ${this.i}`);
      }
      out += ch;
      this.i++;
    }
  }

  /** الأرقام و`true`/`false`/`null` — تُعاد **نصّاً كما كُتبت**. */
  private literal(): string {
    const start = this.i;
    while (this.i < this.src.length && !",]} \t\n\r".includes(this.src[this.i])) this.i++;
    const text = this.src.slice(start, this.i);
    if (!text) throw new SyntaxError(`قيمة فارغة عند ${start}`);
    if (!/^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)$/.test(text)) {
      throw new SyntaxError(`قيمة غير صالحة «${text}» عند ${start}`);
    }
    return text;
  }
}

/**
 * قراءة مستند JSON **مع حفظ الشكل اللفظي للأرقام**.
 *
 * كل قيمة بسيطة تصل نصّاً: `0.0` تبقى `"0.0"`، و`0.00` تبقى `"0.00"`.
 */
export function loadDocument(text: string): EtaValue {
  return new JsonTextParser(text.replace(/^﻿/, "")).parse();
}

/**
 * التسلسل الكنسي لمستند **واحد** — لا لمصفوفة المستندات.
 *
 * ⚠️ جذر المستند هو الكائن الذي يضمّ خصائصه، لا مصفوفة `documents`.
 */
export function serializeDocument(node: EtaValue): string {
  if (typeof node === "string") return `"${node}"`;

  if (Array.isArray(node)) {
    throw new Error("لا تُسلسَل مصفوفة إلا من داخل كائن يحمل اسمها");
  }

  const out: string[] = [];
  for (const [name, value] of Object.entries(node)) {
    const key = `"${name.toUpperCase()}"`;
    if (Array.isArray(value)) {
      out.push(key);                       // بادئة المصفوفة كلها
      for (const element of value) {
        out.push(key);                     // ثم اسم المصفوفة قبل كل عنصر
        out.push(serializeDocument(element));
      }
    } else {
      out.push(key);
      out.push(serializeDocument(value));
    }
  }
  return out.join("");
}

/** تجزئة SHA-256 للنص الكنسي بترميز UTF-8، بصيغة hex بحروف كبيرة. */
export async function canonicalHash(document: EtaValue): Promise<string> {
  const canonical = serializeDocument(document);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

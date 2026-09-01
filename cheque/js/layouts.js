/**
 * قوالب الشيكات — مقاسات وأماكن الحقول بالمليمتر.
 *
 * ⚠️ **صدق واجب:** لا نملك قياسات رسمية لشيكات البنوك، ومقاسات الشيك تختلف
 * بين بنك وآخر بل بين دفتر وآخر. لذلك ما هنا **نقاط بداية** لا قوالب نهائية،
 * والأداة تعتمد على **المعايرة**: يرفع المستخدم صورة شيكه، ويسحب الحقول
 * فوقها، ويحفظ القالب باسمه. هذا أصدق، وأدقّ فعلياً، من ادّعاء قوالب جاهزة.
 *
 * الإحداثيات: x من **يمين** الشيك، y من **أعلاه**، بالمليمتر.
 */

export const LAYOUTS = {
  "eg-standard": {
    name: "شيك مصري — مقاس شائع (نقطة بداية)",
    width: 175, height: 80,
    fields: {
      date:        { x: 30,  y: 16, size: 3.6, label: "التاريخ" },
      payee:       { x: 32,  y: 30, size: 4.0, label: "المستفيد" },
      amountWords: { x: 32,  y: 42, size: 3.8, label: "المبلغ كتابةً" },
      amountWords2:{ x: 20,  y: 50, size: 3.8, label: "تكملة المبلغ" },
      amountDigits:{ x: 140, y: 40, size: 4.4, label: "المبلغ رقماً" },
    },
  },
  "gulf-standard": {
    name: "شيك خليجي — مقاس شائع (نقطة بداية)",
    width: 180, height: 85,
    fields: {
      date:        { x: 28,  y: 18, size: 3.6, label: "التاريخ" },
      payee:       { x: 34,  y: 33, size: 4.0, label: "المستفيد" },
      amountWords: { x: 34,  y: 46, size: 3.8, label: "المبلغ كتابةً" },
      amountWords2:{ x: 22,  y: 54, size: 3.8, label: "تكملة المبلغ" },
      amountDigits:{ x: 145, y: 44, size: 4.4, label: "المبلغ رقماً" },
    },
  },
  "a4-blank": {
    name: "ورقة اختبار A4 (لضبط الطابعة قبل الشيك)",
    width: 210, height: 100,
    fields: {
      date:        { x: 40,  y: 20, size: 4.0, label: "التاريخ" },
      payee:       { x: 40,  y: 35, size: 4.4, label: "المستفيد" },
      amountWords: { x: 40,  y: 50, size: 4.0, label: "المبلغ كتابةً" },
      amountWords2:{ x: 25,  y: 58, size: 4.0, label: "تكملة المبلغ" },
      amountDigits:{ x: 165, y: 48, size: 4.8, label: "المبلغ رقماً" },
    },
  },
};

export const FIELD_ORDER = ["date", "payee", "amountWords", "amountWords2", "amountDigits"];

/** نسخة عميقة — حتى لا يعدّل المستخدم القالب الأصلي. */
export function cloneLayout(key) {
  return JSON.parse(JSON.stringify(LAYOUTS[key] ?? LAYOUTS["eg-standard"]));
}

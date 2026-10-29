/**
 * فحصُ بيانات البائع قبل بناء الفاتورة.
 *
 * دالةٌ نقيّة بلا DOM، ليُختبَر هذا الفحص وحده. الفاتورة الضريبية بلا اسم
 * بائعٍ ليست فاتورة، والرقم الضريبي المكتوب خطأً لا يُقبَل بصمت.
 *
 * الرقم الضريبي **اختياريّ** كما كان: الحقلُ الفارغ يبني فاتورةً بلا رمز QR
 * ويُعلَن ذلك عند البناء. المرفوضُ هو الرقمُ المكتوب وشكلُه خطأ.
 *
 * @param {{ name?: string, vatNumber?: string }} seller القيمُ الخام من النموذج
 * @returns {string[]} رسائلُ المشاكل؛ المصفوفة الفارغة تعني سليماً
 */
export function validateSeller(seller) {
  const problems = [];
  const name = (seller?.name ?? "").trim();
  if (!name || name === "—") problems.push("اسم البائع مطلوب.");

  const vat = (seller?.vatNumber ?? "").trim();
  if (vat && !/^3\d{14}$/.test(vat)) {
    problems.push("الرقم الضريبي يجب أن يكون 15 رقماً لاتينياً يبدأ بـ3.");
  }
  return problems;
}

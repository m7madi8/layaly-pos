const ARABIC = /[\u0600-\u06FF]/;
const TECHNICAL = /firebase|firestore|transaction|undefined|permission|network|unavailable/i;

/**
 * رسائل المنطق الجاهزة (مثل «مخزون X غير كافٍ») بالعربية تُعرض كما هي.
 * أي خطأ تقني (FirebaseError، transaction failed…) يُستبدل بالرسالة الاحتياطية الواضحة.
 */
export function friendlyError(error, fallback) {
  const msg = typeof error === 'string' ? error : error?.message || '';
  if (ARABIC.test(msg) && !TECHNICAL.test(msg)) return msg;
  // eslint-disable-next-line no-console
  console.error(error);
  return fallback;
}

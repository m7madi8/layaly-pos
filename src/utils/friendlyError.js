const ARABIC = /[\u0600-\u06FF]/;
const TECHNICAL = /firebase|firestore|transaction|undefined|permission|network|unavailable/i;

/**
 * رسائل المنطق الجاهزة (مثل «مخزون X غير كافٍ») بالعربية تُعرض كما هي.
 * أي خطأ تقني (FirebaseError، transaction failed…) يُستبدل بالرسالة الاحتياطية الواضحة.
 */
export function friendlyError(error, fallback) {
  const msg = typeof error === 'string' ? error : error?.message || '';
  const code = typeof error === 'object' && error ? error.code : '';
  if (
    code === 'resource-exhausted' ||
    /quota exceeded|too many requests|429/i.test(msg)
  ) {
    return 'كثرة الطلبات على قاعدة البيانات — انتظر 30–60 ثانية، أغلق التبويبات المكررة، ثم أعد المحاولة مرة واحدة.';
  }
  if (/reading 'path'|invalid document reference/i.test(msg)) {
    // eslint-disable-next-line no-console
    console.error(error);
    return (
      'تعذّر حفظ الطلب بسبب بيانات غير متزامنة — حدّث الصفحة (Ctrl+F5)، أفرغ السلة، وأعد إضافة الأصناف. ' +
      'للدفع النقدي تأكد أن وردية الكاش مفتوحة.'
    );
  }
  if (ARABIC.test(msg) && !TECHNICAL.test(msg)) return msg;
  // eslint-disable-next-line no-console
  console.error(error);
  return fallback;
}

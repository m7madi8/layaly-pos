/** عملاء ليالي — عقد النسخ الاحتياطي. الإصدار 1 ثابت ولا يُرفع بصمت. */
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_KIND = 'layali.customers.backup';
export const BACKUP_DATABASE_ID = '(default)';
export const CUSTOMERS_BACKUP_PAGE_SIZE = 200;

/**
 * خطة الإنتاج الحالية Spark: لا Cloud Functions منشورة، ولا تصدير Firestore مجدول.
 * تخزين المتصفح ليس بديلاً عن نسخة سحابية دائمة، لذلك السحابة تبقى غير متاحة صراحة.
 */
export const CLOUD_BACKUP = {
  available: false,
  durable: false,
  plan: 'spark',
  infrastructure: 'firestore-export-and-cloud-functions-unavailable',
  reason:
    'النسخ السحابي التلقائي غير متاح. خطة Spark لا تشغّل Cloud Functions ولا التصدير المجدول إلى Cloud Storage. لن يُحفظ الملف في المتصفح كبديل لنسخة دائمة.',
};

/** الكتابة على مستندات العملاء أثناء الاستعادة مغلقة حتى توجد آلية خادم مختبرة. */
export const RESTORE_WRITES_ENABLED = false;

export const RESTORE_ROLLBACK_STRATEGY =
  'لا تُنفَّذ أي كتابة، فلا يوجد تغيير يحتاج رجوعاً. عند تفعيل الاستعادة لاحقاً على خادم مختبر يجب أخذ نسخة كاملة مباشرة قبل أول دفعة، ورفض العملية عند أي تعارض مالي، ثم استرجاع الدفعة من تلك النسخة إن فشلت الكتابة.';

/**
 * بوابة الاستعادة على الخادم. الدالة ترفض دائماً: لا كتابة على العملاء
 * حتى لو استُدعي الملف من دالة سحابية لاحقاً بالخطأ.
 * غير مصدَّر من index.js حتى لا يُنشر مسار استعادة.
 */

const RESTORE_WRITES_ENABLED = false;
const CLOUD_BACKUP_ENABLED = false;

function assertCustomerRestoreAllowed() {
  const error = new Error(
    'استعادة عملاء الإنتاج متوقفة. لا توجد آلية خادم مختبرة على خطة Spark، ولن تُكتب مستندات العملاء.'
  );
  error.code = 'restore-disabled';
  throw error;
}

module.exports = {
  RESTORE_WRITES_ENABLED,
  CLOUD_BACKUP_ENABLED,
  assertCustomerRestoreAllowed,
};

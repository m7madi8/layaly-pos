#!/usr/bin/env node
/**
 * نقطة تشغيل خارج المتصفح. تخرج فوراً إذا لم تكتمل شروط التسليح.
 * لا تقرأ Firestore من هذا المسار الافتراضي.
 */
const { assessInfrastructure } = require('./engine');

const gate = assessInfrastructure(process.env);
if (!gate.ok) {
  process.stderr.write(`${gate.message}\nناقص: ${gate.missing.join(', ')}\n`);
  process.exit(2);
}

process.stderr.write('التشغيل المسلّح غير موصول بعميل إنتاج في هذا الإصدار.\n');
process.exit(2);

import React, { useState } from 'react';
import { DatabaseBackup, ShieldAlert } from 'lucide-react';
import {
  KNOWN_FIRESTORE_PATHS,
  OTHER_DATA_SOURCES,
  SYSTEM_BACKUP_STATUS,
} from '../services/disasterRecovery/coverage';

export default function DisasterRecoveryPanel({ FONT_UI, FONT_HEADING }) {
  const [notice, setNotice] = useState('');
  const status = SYSTEM_BACKUP_STATUS;

  const refuse = (message) => setNotice(message);

  return (
    <section className="mt-6 bg-white rounded-xl p-5 shadow-md border border-gray-200" dir="rtl" style={{ fontFamily: FONT_UI }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base md:text-lg text-primary flex items-center gap-2" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
            <DatabaseBackup size={18} />
            النسخ الاحتياطية
          </h3>
          <p className="text-xs text-gray-500 mt-1">نسخة النظام كاملة، مستقلة عن نسخة العملاء.</p>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-100">غير مسلّح</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-4">
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-gray-400">آخر نسخة ناجحة</p>
          <p className="font-semibold text-primary mt-1">لا توجد</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-gray-400">الموعد المقصود</p>
          <p className="font-semibold text-primary mt-1">{status.scheduleLabel}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-gray-400">الحالة</p>
          <p className="font-semibold text-primary mt-1">متوقف</p>
        </div>
      </div>

      <p className="text-xs text-amber-950 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-5">{status.reason}</p>

      {notice ? (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 mt-3">{notice}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600"
          onClick={() => refuse('النسخ اليدوي يستدعي عاملاً خلفياً بمفتاح خادم. لا يوجد عامل مسلّح، ولن تُقرأ قاعدة الإنتاج من المتصفح.')}
        >
          نسخ يدوي
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600"
          onClick={() => refuse('لا يوجد ملف نسخة كاملة للتنزيل. نسخة العملاء في شاشة العملاء ليست بديلاً.')}
        >
          تنزيل
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600"
          onClick={() => refuse('معاينة الاستعادة تُفتح على ملف نسخة كاملة فقط، والكتابة على الإنتاج مغلقة.')}
        >
          معاينة استعادة
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
          <ShieldAlert size={14} />
          مصادر يجب أن تغطيها النسخة عند التسليح
        </p>
        <ul className="max-h-48 overflow-y-auto text-[11px] text-gray-600 space-y-1">
          {KNOWN_FIRESTORE_PATHS.map((row) => (
            <li key={row.path}><span className="font-mono text-gray-800">{row.path}</span> — {row.role}</li>
          ))}
          {OTHER_DATA_SOURCES.map((row) => (
            <li key={row.id}>{row.label}: {row.detail}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

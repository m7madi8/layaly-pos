import React, { useEffect, useId, useRef, useState } from 'react';
import { DatabaseBackup, Eye, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { CLOUD_BACKUP } from '../services/customerBackup/constants';
import { writeCustomerBackupAudit } from '../services/customerBackup/auditBackup';
import { parseBackupText, validateBackupEnvelope } from '../services/customerBackup/backupModel';
import { createCustomerBackup } from '../services/customerBackup/createCustomerBackup';
import {
  createFirestoreCustomerPageReader,
  currentFirebaseProjectId,
} from '../services/customerBackup/firestoreCustomerReader';
import { paginateCustomerDocuments } from '../services/customerBackup/paginateCustomers';
import { executeCustomerRestore, previewCustomerRestore } from '../services/customerBackup/restorePreview';
import { listSessionBackups, rememberSessionBackup } from '../services/customerBackup/sessionHistory';

const READ_COST = 'تُقرأ المجموعة كاملة عند الطلب فقط: قراءة Firestore واحدة لكل مستند عميل، وقراءة واحدة إضافية إن انتهت الصفحات على صفحة فارغة. فتح هذه النافذة لا يقرأ العملاء.';

function formatBytes(size) {
  if (!Number.isFinite(size)) return '—';
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} ك.ب`;
  return `${(size / (1024 * 1024)).toFixed(1)} م.ب`;
}

function formatWhen(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

const CONFLICT_LABELS = {
  'missing-balance': 'رصيد غير متوفر ولا يُعامل كصفر',
  'live-has-entries-absent-from-backup': 'حركات حالية غير موجودة في الملف',
  'live-newer': 'بيانات الحساب الحالي أحدث من الملف',
  'freshness-unknown': 'لا يمكن تحديد أي سجل أحدث',
  'financial-drift': 'اختلاف في الرصيد أو الحركة',
};

function formatDebt(fmtMoney, value, authoritative) {
  if (authoritative !== true || typeof value !== 'number') return 'غير محسوم';
  return fmtMoney(value);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ActionRow({ icon: Icon, title, detail, onClick, disabled, theme, FONT_UI }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-start flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
      style={{ fontFamily: FONT_UI }}
    >
      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: theme.primary }}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{detail}</span>
      </span>
    </button>
  );
}

export default function CustomerBackupModal({
  open,
  onClose,
  tenantUid,
  fmtMoney,
  theme,
  FONT_UI,
  FONT_HEADING,
}) {
  const titleId = useId();
  const fileRef = useRef(null);
  const [view, setView] = useState('menu');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const previewLock = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const refreshHistory = () => setHistory(listSessionBackups());

  const runBackup = async () => {
    if (busy) return;
    if (!window.confirm('ستُقرأ كل مستندات العملاء من Firestore. التكلفة تساوي عدد العملاء تقريباً. المتابعة؟')) return;
    const projectId = currentFirebaseProjectId();
    if (!tenantUid || !projectId) {
      setError('الحساب أو مشروع Firebase غير جاهز. لم يبدأ النسخ.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setProgress({ pagesRead: 0, documentsRead: 0 });
    setView('progress');
    try {
      const result = await createCustomerBackup({
        tenantUid,
        projectId,
        isAdmin: true,
        readPage: createFirestoreCustomerPageReader(tenantUid),
        onProgress: setProgress,
        auditWriter: (entry) => writeCustomerBackupAudit(tenantUid, entry),
      });
      downloadTextFile(result.filename, result.json);
      rememberSessionBackup({
        backupId: result.envelope.backupId,
        createdAt: result.envelope.createdAt,
        customerCount: result.envelope.customerCount,
        debtorCount: result.envelope.debtorCount,
        totalOutstandingDebt: result.envelope.totalOutstandingDebt,
        outstandingDebtAuthoritative: result.envelope.outstandingDebtAuthoritative,
        byteSize: result.byteSize,
        filename: result.filename,
        status: 'complete',
        json: result.json,
        envelope: result.envelope,
      });
      refreshHistory();
      setNotice(result.audit?.warning || 'تم تنزيل النسخة. احتفظ بالملف خارج الجهاز إن أمكن؛ لا توجد نسخة سحابية دائمة.');
      setView('history');
    } catch (err) {
      setError(err?.message || 'تعذر إنشاء النسخة.');
      setView('menu');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const openPreview = async (envelope) => {
    if (busy || previewLock.current || !envelope) return;
    if (!tenantUid) {
      setError('حساب المقهى غير محدد. أُلغيت المعاينة.');
      return;
    }
    const projectId = currentFirebaseProjectId();
    if (!projectId) {
      setError('معرّف مشروع Firebase غير متاح. أُلغيت المعاينة قبل أي قراءة.');
      return;
    }
    const checked = validateBackupEnvelope(envelope, {
      tenantUid,
      projectId,
      databaseId: '(default)',
    });
    if (!checked.ok) {
      setError(checked.errors.join(' '));
      setView('menu');
      return;
    }
    if (!window.confirm('المعاينة ستعيد قراءة كل العملاء من الخادم للمقارنة. لن تُكتب أرصدة أو دفعات. المتابعة؟')) return;
    previewLock.current = true;
    setBusy(true);
    setError('');
    setPreview(null);
    setProgress({ pagesRead: 0, documentsRead: 0 });
    setView('progress');
    try {
      const live = await paginateCustomerDocuments({
        pageSize: 200,
        readPage: createFirestoreCustomerPageReader(tenantUid),
        onProgress: setProgress,
      });
      const result = previewCustomerRestore({ backup: checked.backup, liveDocuments: live.documents });
      try {
        await writeCustomerBackupAudit(tenantUid, {
          action: 'customer_restore_preview',
          status: result.requiresManualReconciliation ? 'blocked' : 'preview',
          backupId: checked.backup.backupId,
          customerCount: checked.backup.customerCount,
          debtorCount: checked.backup.debtorCount,
          totalOutstandingDebt: checked.backup.totalOutstandingDebt,
          checksum: checked.backup.checksum,
        });
      } catch {
        setNotice('اكتملت المعاينة، وتعذر حفظ سجل التدقيق.');
      }
      setPreview(result);
      setView('preview');
    } catch (err) {
      setError(err?.message || 'تعذرت المعاينة. لم تُكتب أي بيانات.');
      setView('menu');
    } finally {
      previewLock.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!tenantUid || !currentFirebaseProjectId()) {
      setError('الحساب أو مشروع Firebase غير جاهز. لم يُفتح الملف.');
      return;
    }
    setError('');
    let text = '';
    try {
      text = await file.text();
    } catch {
      setError('تعذر قراءة الملف.');
      return;
    }
    const parsed = parseBackupText(text, {
      tenantUid,
      projectId: currentFirebaseProjectId(),
      databaseId: '(default)',
    });
    if (!parsed.ok) {
      setError(parsed.errors.join(' '));
      setView('menu');
      return;
    }
    await openPreview(parsed.backup);
  };

  const attemptRestore = () => {
    try {
      executeCustomerRestore(preview, {});
    } catch (err) {
      setError(err.message);
    }
  };

  const showHistory = () => {
    refreshHistory();
    setError('');
    setView('history');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl border border-gray-200 shadow-xl max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <p className="text-[11px] text-gray-400" style={{ fontFamily: FONT_UI }}>العملاء</p>
            <h3 id={titleId} className="text-xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              النسخ الاحتياطية للعملاء
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3" style={{ fontFamily: FONT_UI }}>
          {error ? (
            <p className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          ) : null}
          {notice ? (
            <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{notice}</p>
          ) : null}

          {view === 'progress' && (
            <div className="py-6">
              <p className="text-sm font-semibold text-primary">جاري القراءة من الخادم</p>
              <p className="text-xs text-gray-500 mt-1">
                صفحة {progress?.pagesRead || 0} — {progress?.documentsRead || 0} عميل. لن يُحفظ ملف إذا توقفت صفحة.
              </p>
              <div className="mt-4 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full w-1/3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
              </div>
            </div>
          )}

          {view === 'menu' && (
            <>
              <ActionRow
                icon={DatabaseBackup}
                title="إنشاء نسخة احتياطية"
                detail="قراءة كل العملاء من Firestore ثم تنزيل ملف JSON"
                onClick={runBackup}
                disabled={busy || !tenantUid}
                theme={theme}
                FONT_UI={FONT_UI}
              />
              <ActionRow
                icon={Eye}
                title="استعراض النسخ الاحتياطية"
                detail="سجل الملفات التي نُزّلت في هذه الجلسة"
                onClick={showHistory}
                disabled={busy}
                theme={theme}
                FONT_UI={FONT_UI}
              />
              <ActionRow
                icon={RotateCcw}
                title="استعادة نسخة احتياطية"
                detail="تحقق ومعاينة فقط. الكتابة على الإنتاج متوقفة"
                onClick={() => fileRef.current?.click()}
                disabled={busy || !tenantUid}
                theme={theme}
                FONT_UI={FONT_UI}
              />
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-[11px] text-amber-950 leading-5">
                <p className="font-semibold mb-1">نسخ سحابي: غير متاح</p>
                <p>{CLOUD_BACKUP.reason}</p>
                <p className="mt-2">هذا الملف للعملاء فقط، وليس نسخة النظام الكاملة.</p>
              </div>
              <p className="text-[11px] text-gray-500 leading-5">{READ_COST}</p>
            </>
          )}

          {view === 'history' && (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 leading-5">
                هذه الملفات نُزّلت على هذا الجهاز أثناء الجلسة الحالية. ليست نسخاً سحابية موثّقة.
              </p>
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">لا توجد نسخة في هذه الجلسة. أنشئ نسخة أو افتح ملفاً من الجهاز.</p>
              ) : history.map((item) => (
                <div key={item.backupId} className="border border-gray-200 rounded-2xl px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-primary">{formatWhen(item.createdAt)}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">ملف محمّل</span>
                  </div>
                  <p className="text-gray-500 mt-1">
                    {item.customerCount} عميل — الدين {formatDebt(fmtMoney, item.totalOutstandingDebt, item.outstandingDebtAuthoritative)} — {formatBytes(item.byteSize)} — {item.status === 'complete' ? 'مكتملة' : item.status}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border border-gray-200"
                      onClick={() => item.json && downloadTextFile(item.filename, item.json)}
                      disabled={!item.json}
                    >
                      تنزيل
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border border-gray-200"
                      onClick={() => openPreview(item.envelope)}
                      disabled={!item.envelope || busy}
                    >
                      معاينة استعادة
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="text-xs text-primary underline" onClick={() => fileRef.current?.click()}>
                فتح ملف من الجهاز
              </button>
              <button type="button" className="block text-xs text-gray-500" onClick={() => setView('menu')}>رجوع</button>
            </div>
          )}

          {view === 'preview' && preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">عملاء النسخة</p>
                  <p className="text-lg font-semibold text-primary">{preview.customerCount}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">إجمالي الدين في الملف</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatDebt(fmtMoney, preview.totalOutstandingDebt, preview.outstandingDebtAuthoritative)}
                  </p>
                </div>
              </div>
              <ul className="text-xs text-gray-700 space-y-1">
                <li>سيُنشأ: {preview.counts.create}</li>
                <li>سيُحدَّث بلا تغيير مالي: {preview.counts.update}</li>
                <li>بلا تغيير: {preview.counts.unchanged}</li>
                <li>سيبقى كما هو لأنه غير موجود في الملف: {preview.counts.preserved}</li>
                <li>تعارضات مالية: {preview.counts.financialConflicts}</li>
              </ul>
              {preview.requiresManualReconciliation ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <p className="font-semibold flex items-center gap-1"><ShieldAlert size={14} /> لا يمكن ضمان الاتساق المالي</p>
                  <p className="mt-1">لن تُستبدل الأرصدة أو الدفعات الأحدث. راجع التعارضات يدوياً.</p>
                  <ul className="mt-2 space-y-1">
                    {preview.conflicts.slice(0, 8).map((row) => (
                      <li key={row.id}>{row.name || row.id} — {CONFLICT_LABELS[row.reason] || row.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-gray-500">لا تعارض مالي في هذه المعاينة. العملاء الغائبون عن الملف لن يُحذفوا.</p>
              )}
              <p className="text-[11px] text-gray-500 leading-5">{preview.rollback}</p>
              <button
                type="button"
                onClick={attemptRestore}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm"
              >
                استعادة على الإنتاج متوقفة
              </button>
              <button type="button" className="text-xs text-gray-500" onClick={() => setView('menu')}>رجوع</button>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickFile} />
      </div>
    </div>
  );
}

export function CustomerBackupButton({ onClick, FONT_UI }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-primary hover:bg-gray-50"
      style={{ fontFamily: FONT_UI }}
    >
      <DatabaseBackup size={16} />
      النسخ الاحتياطية
    </button>
  );
}

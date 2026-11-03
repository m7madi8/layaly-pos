import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserMinus, UserPlus, Pencil } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { getActiveOnDutyIdsFromShift } from '../utils/shiftOnDutyRoster';
import { uniqueStaffMembersByName } from '../utils/employeeBenefitAccounting';
import StaffQuickFormModal from './StaffQuickFormModal';

export default function OpenShiftOnDutyManageModal({
  openShift,
  staffMembers = [],
  canManageStaff = false,
  onCreateStaff,
  onUpdateStaff,
  staffFormBusy = false,
  busy,
  onAddStaff,
  onRemoveStaff,
  onClose,
}) {
  const activeIds = useMemo(
    () => getActiveOnDutyIdsFromShift(openShift),
    [openShift]
  );

  const [pickAdd, setPickAdd] = useState('');
  const [staffForm, setStaffForm] = useState(null);
  const staffList = useMemo(
    () => uniqueStaffMembersByName(staffMembers).filter((s) => s.active !== false),
    [staffMembers]
  );

  const notOnDuty = staffList.filter((s) => !activeIds.includes(s.id));

  const activeStaff = useMemo(() => {
    const byId = Object.fromEntries(staffList.map((s) => [s.id, s]));
    return activeIds.map((id) => byId[id] || { id, name: '—' });
  }, [activeIds, staffList]);

  useEffect(() => {
    setPickAdd('');
  }, [openShift?.id]);

  return (
    <>
      <div
        className="fixed inset-0 z-[75] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md border border-gray-200 shadow-xl max-h-[92vh] overflow-y-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-11 h-11 rounded-xl bg-[var(--color-bg-warm)] text-primary grid place-items-center">
              <Users size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
                المداومون في الشفت الحالي
              </h2>
              <p className="text-xs text-gray-600 mt-0.5" style={{ fontFamily: FONT_UI }}>
                إضافة موظف لا تفتح شفتاً جديداً ولا تمسّ رصيد الصندوق — يُسجَّل وقت الإضافة والمُضيف.
              </p>
            </div>
          </div>

          {canManageStaff && onCreateStaff && (
            <button
              type="button"
              onClick={() => setStaffForm({ mode: 'create' })}
              className="w-full mb-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-primary font-semibold flex items-center justify-center gap-2"
              style={{ fontFamily: FONT_UI }}
            >
              <UserPlus size={16} />
              موظف جديد
            </button>
          )}

          <p className="text-sm font-semibold text-primary mb-2" style={{ fontFamily: FONT_UI }}>
            المداومون الآن ({activeStaff.length})
          </p>
          <ul className="space-y-2 mb-4 border border-gray-100 rounded-xl p-3 max-h-36 overflow-y-auto">
            {activeStaff.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{s.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {canManageStaff && onUpdateStaff && (
                    <button
                      type="button"
                      aria-label={`تعديل ${s.name}`}
                      onClick={() => setStaffForm({ mode: 'edit', staffId: s.id, initial: s })}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || activeStaff.length <= 1}
                    onClick={() => onRemoveStaff(s.id)}
                    className="text-xs text-red-700 font-semibold flex items-center gap-1 disabled:opacity-40 px-2 py-1"
                    title={activeStaff.length <= 1 ? 'يجب بقاء موظف واحد على الأقل' : 'إزالة من المداومين'}
                  >
                    <UserMinus size={14} />
                    إزالة
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-sm font-semibold text-primary mb-2 flex items-center gap-1" style={{ fontFamily: FONT_UI }}>
            <UserPlus size={16} /> إضافة إلى الشفت
          </p>
          <div className="flex gap-2 mb-2">
            <select
              value={pickAdd}
              onChange={(e) => setPickAdd(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
            >
              <option value="">اختر موظفاً…</option>
              {notOnDuty.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !pickAdd}
              onClick={async () => {
                const s = staffList.find((m) => m.id === pickAdd);
                if (!s) return;
                await onAddStaff(s.id, s.name);
                setPickAdd('');
              }}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 shrink-0"
              style={{ backgroundColor: 'var(--color-primary, #5c4033)', fontFamily: FONT_UI }}
            >
              إضافة
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 mt-4 rounded-xl border border-gray-200 text-sm"
            style={{ fontFamily: FONT_UI }}
          >
            إغلاق
          </button>
        </div>
      </div>

      {staffForm && canManageStaff && (
        <StaffQuickFormModal
          mode={staffForm.mode}
          initial={staffForm.initial}
          busy={staffFormBusy}
          onClose={() => setStaffForm(null)}
          onSave={async (form) => {
            if (staffForm.mode === 'edit' && staffForm.staffId) {
              await onUpdateStaff(staffForm.staffId, form);
            } else if (onCreateStaff) {
              const newId = await onCreateStaff(form);
              if (newId) await onAddStaff(newId, form.name);
            }
          }}
        />
      )}
    </>
  );
}

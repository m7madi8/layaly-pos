import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { FONT_UI } from '../branding';
import { uniqueStaffMembersByName } from '../utils/employeeBenefitAccounting';
import StaffQuickFormModal from './StaffQuickFormModal';

/**
 * Multi-select on-duty staff with optional inline create/edit (admin).
 * @param {Record<string, boolean>} onDuty - controlled map staffId -> checked
 * @param {(map: Record<string, boolean>) => void} setOnDuty
 */
export default function ShiftOnDutyStaffPanel({
  staffMembers = [],
  onDuty,
  setOnDuty,
  canManageStaff = false,
  onCreateStaff,
  onUpdateStaff,
  staffFormBusy = false,
  showAddToShiftHint = false,
  maxHeightClass = 'max-h-40',
}) {
  const [staffForm, setStaffForm] = useState(null);
  const staffList = useMemo(
    () => uniqueStaffMembersByName(staffMembers).filter((s) => s.active !== false),
    [staffMembers]
  );

  useEffect(() => {
    if (!staffForm?.staffId || staffForm.mode !== 'edit') return;
    const fresh = staffList.find((s) => s.id === staffForm.staffId);
    if (fresh && fresh.name !== staffForm.initial?.name) {
      setStaffForm((prev) => (prev ? { ...prev, initial: fresh } : prev));
    }
  }, [staffList, staffForm?.staffId, staffForm?.mode, staffForm?.initial?.name]);

  const toggle = (id, checked) => {
    setOnDuty((prev) => ({ ...prev, [id]: checked }));
  };

  const afterCreate = async (form) => {
    const newId = await onCreateStaff(form);
    if (newId) setOnDuty((prev) => ({ ...prev, [newId]: true }));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-primary" style={{ fontFamily: FONT_UI }}>
          الموظفون المداومون *
        </p>
        {canManageStaff && onCreateStaff && (
          <button
            type="button"
            onClick={() => setStaffForm({ mode: 'create' })}
            className="text-xs font-semibold text-primary flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
            style={{ fontFamily: FONT_UI }}
          >
            <UserPlus size={14} />
            موظف جديد
          </button>
        )}
      </div>
      {showAddToShiftHint && (
        <p className="text-[11px] text-gray-500 mb-2" style={{ fontFamily: FONT_UI }}>
          يمكنك اختيار أكثر من موظف. التعديل على بيانات الموظف لا يغيّر سجلات الشفتات السابقة.
        </p>
      )}
      <div className={`${maxHeightClass} overflow-y-auto space-y-2 mb-2 border border-gray-100 rounded-xl p-3`}>
        {staffList.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={Boolean(onDuty[s.id])}
                onChange={(e) => toggle(s.id, e.target.checked)}
              />
              <span className="truncate">{s.name}</span>
            </label>
            {canManageStaff && onUpdateStaff && (
              <button
                type="button"
                aria-label={`تعديل ${s.name}`}
                onClick={() => setStaffForm({ mode: 'edit', staffId: s.id, initial: s })}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        ))}
        {staffList.length === 0 && (
          <p className="text-xs text-gray-500" style={{ fontFamily: FONT_UI }}>
            {canManageStaff
              ? 'لا موظفين — أضف موظفاً جديداً من الزر أعلاه.'
              : 'لا موظفين — اطلب من المدير إضافتهم من قسم الموظفين.'}
          </p>
        )}
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
            } else {
              await afterCreate(form);
            }
          }}
        />
      )}
    </>
  );
}

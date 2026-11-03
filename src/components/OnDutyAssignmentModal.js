import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import ShiftOnDutyStaffPanel from './ShiftOnDutyStaffPanel';

export default function OnDutyAssignmentModal({
  openShift,
  staffMembers = [],
  canManageStaff = false,
  onCreateStaff,
  onUpdateStaff,
  staffFormBusy = false,
  busy,
  onSave,
  onDismiss,
}) {
  const [onDuty, setOnDuty] = useState({});

  useEffect(() => {
    setOnDuty({});
  }, [openShift?.id]);

  const onDutyIds = useMemo(
    () => Object.keys(onDuty).filter((id) => onDuty[id]),
    [onDuty]
  );
  const valid = onDutyIds.length > 0;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-amber-200 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 grid place-items-center">
            <Users size={22} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
              تعيين الموظفين المداومين
            </h2>
            <p className="text-xs text-gray-600 mt-0.5" style={{ fontFamily: FONT_UI }}>
              وردية قديمة مفتوحة بدون قائمة مداومين — لن تُقبل أي استفادة حتى الإكمال. لا يُعدَّل أي شفت مغلق.
            </p>
          </div>
        </div>

        <ShiftOnDutyStaffPanel
          staffMembers={staffMembers}
          onDuty={onDuty}
          setOnDuty={setOnDuty}
          canManageStaff={canManageStaff}
          onCreateStaff={onCreateStaff}
          onUpdateStaff={onUpdateStaff}
          staffFormBusy={staffFormBusy}
          showAddToShiftHint
          maxHeightClass="max-h-48"
        />

        <div className="flex gap-2 mt-4">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600"
              style={{ fontFamily: FONT_UI }}
            >
              لاحقاً
            </button>
          )}
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => onSave(onDutyIds)}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary, #5c4033)', fontFamily: FONT_UI }}
          >
            {busy ? 'جاري الحفظ…' : 'حفظ المداومين'}
          </button>
        </div>
      </div>
    </div>
  );
}

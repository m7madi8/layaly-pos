import { getActiveOnDutyIdsFromShift, buildWorkedStaffSnapshot } from './shiftOnDutyRoster';

export { buildWorkedStaffSnapshot, getActiveOnDutyIdsFromShift };

/** Open shift created before on-duty feature — must assign staff before benefits. */
export function openShiftNeedsOnDutyAssignment(openShift) {
  if (!openShift || openShift.status !== 'open') return false;
  return !Array.isArray(openShift.onDutyStaffIds);
}

/** On-duty ids for an open shift; null only when shift is not open. */
export function resolveOnDutyStaffIds(openShift) {
  if (!openShift || openShift.status !== 'open') return null;
  if (openShiftNeedsOnDutyAssignment(openShift)) return [];
  return getActiveOnDutyIdsFromShift(openShift);
}

export function assertStaffOnDutyForShift(openShift, staffMemberId) {
  const id = String(staffMemberId || '').trim();
  if (!id) throw new Error('اختر الموظف');
  if (!openShift || openShift.status !== 'open') {
    throw new Error('لا توجد وردية كاش مفتوحة');
  }
  if (openShiftNeedsOnDutyAssignment(openShift)) {
    throw new Error(
      'هذه الوردية قديمة ولم يُحدَّد فيها موظفون مداومون — عيّن المداومين من شاشة الصندوق قبل تسجيل الاستفادة'
    );
  }
  const onDuty = resolveOnDutyStaffIds(openShift);
  if (!onDuty || onDuty.length === 0) {
    throw new Error('لم يُحدَّد موظفون مداومون في هذه الوردية');
  }
  if (!onDuty.includes(id)) {
    throw new Error('الموظف غير مداوم في الشفت الحالي — لا يمكن تسجيل استفادة باسمه');
  }
}

export function filterStaffByOnDuty(staffMembers, openShift) {
  const list = (staffMembers || []).filter((s) => s.active !== false);
  if (!openShift || openShift.status !== 'open') return list;
  if (openShiftNeedsOnDutyAssignment(openShift)) return [];
  const onDuty = resolveOnDutyStaffIds(openShift);
  if (!onDuty || onDuty.length === 0) return [];
  return list.filter((s) => onDuty.includes(s.id));
}

function openShiftNeedsOnDutyAssignment(openShift) {
  if (!openShift || openShift.status !== 'open') return false;
  return !Array.isArray(openShift.onDutyStaffIds);
}

function getActiveOnDutyIdsFromShift(openShift) {
  if (!openShift || openShift.status !== 'open') return [];
  if (openShiftNeedsOnDutyAssignment(openShift)) return [];
  const roster = openShift.onDutyStaffRoster;
  if (Array.isArray(roster) && roster.length) {
    return roster.filter((e) => e && e.removedAtMs == null).map((e) => String(e.staffMemberId || e.id || '').trim()).filter(Boolean);
  }
  return (openShift.onDutyStaffIds || []).map(String);
}

function assertStaffOnDutyForShift(openShift, staffMemberId) {
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
  const onDuty = getActiveOnDutyIdsFromShift(openShift);
  if (!onDuty.length) throw new Error('لم يُحدَّد موظفون مداومون في هذه الوردية');
  if (!onDuty.includes(id)) {
    throw new Error('الموظف غير مداوم في الشفت الحالي — لا يمكن تسجيل استفادة باسمه');
  }
}

module.exports = { assertStaffOnDutyForShift, getActiveOnDutyIdsFromShift };

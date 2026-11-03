/** صلاحيات تشغيلية على مستوى سجل الموظف (staffMembers). */

export const DEFAULT_STAFF_PERMISSIONS = {
  canRecordEmployeeBenefit: true,
  canRecordEmployeeAdvance: true,
};

export function resolveStaffPermissions(staff) {
  const raw = staff?.permissions && typeof staff.permissions === 'object' ? staff.permissions : {};
  return {
    canRecordEmployeeBenefit:
      raw.canRecordEmployeeBenefit !== false && DEFAULT_STAFF_PERMISSIONS.canRecordEmployeeBenefit,
    canRecordEmployeeAdvance:
      raw.canRecordEmployeeAdvance !== false && DEFAULT_STAFF_PERMISSIONS.canRecordEmployeeAdvance,
  };
}

export function staffAllowsEmployeeBenefit(staff) {
  return resolveStaffPermissions(staff).canRecordEmployeeBenefit;
}

export function staffAllowsEmployeeAdvance(staff) {
  return resolveStaffPermissions(staff).canRecordEmployeeAdvance;
}

export function filterStaffForEmployeeBenefit(staffMembers) {
  return (staffMembers || []).filter((s) => staffAllowsEmployeeBenefit(s));
}

export function filterStaffForEmployeeAdvance(staffMembers) {
  return (staffMembers || []).filter((s) => staffAllowsEmployeeAdvance(s));
}

export function normalizeStaffPermissionsPatch(permissions) {
  if (!permissions || typeof permissions !== 'object') return { ...DEFAULT_STAFF_PERMISSIONS };
  return {
    canRecordEmployeeBenefit: permissions.canRecordEmployeeBenefit !== false,
    canRecordEmployeeAdvance: permissions.canRecordEmployeeAdvance !== false,
  };
}

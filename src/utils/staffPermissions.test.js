import {
  resolveStaffPermissions,
  staffAllowsEmployeeAdvance,
  staffAllowsEmployeeBenefit,
  filterStaffForEmployeeBenefit,
  normalizeStaffPermissionsPatch,
} from './staffPermissions';

describe('staffPermissions', () => {
  test('defaults allow benefit and advance', () => {
    expect(resolveStaffPermissions({})).toEqual({
      canRecordEmployeeBenefit: true,
      canRecordEmployeeAdvance: true,
    });
  });

  test('explicit false disables', () => {
    expect(
      staffAllowsEmployeeBenefit({
        permissions: { canRecordEmployeeBenefit: false },
      })
    ).toBe(false);
    expect(
      staffAllowsEmployeeAdvance({
        permissions: { canRecordEmployeeAdvance: false },
      })
    ).toBe(false);
  });

  test('filter benefit list', () => {
    const list = [
      { id: '1', permissions: { canRecordEmployeeBenefit: false } },
      { id: '2' },
    ];
    expect(filterStaffForEmployeeBenefit(list).map((s) => s.id)).toEqual(['2']);
  });

  test('normalize patch', () => {
    expect(
      normalizeStaffPermissionsPatch({
        canRecordEmployeeBenefit: false,
        canRecordEmployeeAdvance: true,
      })
    ).toEqual({
      canRecordEmployeeBenefit: false,
      canRecordEmployeeAdvance: true,
    });
  });
});

import {
  resolveOnDutyStaffIds,
  assertStaffOnDutyForShift,
  filterStaffByOnDuty,
  openShiftNeedsOnDutyAssignment,
} from './shiftOnDuty';
import {
  appendOnDutyRosterEntry,
  buildOnDutyRosterInitial,
  getActiveOnDutyIdsFromShift,
  markOnDutyRosterRemoved,
} from './shiftOnDutyRoster';

describe('shiftOnDuty', () => {
  test('legacy shift without onDutyStaffIds needs assignment', () => {
    expect(openShiftNeedsOnDutyAssignment({ status: 'open' })).toBe(true);
    expect(resolveOnDutyStaffIds({ status: 'open' })).toEqual([]);
    expect(filterStaffByOnDuty([{ id: 'a', name: 'A' }], { status: 'open' })).toEqual([]);
    expect(() => assertStaffOnDutyForShift({ status: 'open' }, 'a')).toThrow(/قديمة/);
  });

  test('rejects staff not on duty list', () => {
    const shift = { status: 'open', onDutyStaffIds: ['x'] };
    expect(() => assertStaffOnDutyForShift(shift, 'y')).toThrow(/غير مداوم/);
    expect(filterStaffByOnDuty([{ id: 'x' }, { id: 'y' }], shift)).toEqual([{ id: 'x' }]);
  });

  test('roster drives active on-duty ids', () => {
    const shift = {
      status: 'open',
      onDutyStaffIds: ['a', 'b'],
      onDutyStaffRoster: [
        { staffId: 'a', nameSnapshot: 'A', removedAtMs: null },
        { staffId: 'b', nameSnapshot: 'B', removedAtMs: 1 },
        { staffId: 'c', nameSnapshot: 'C', removedAtMs: null },
      ],
    };
    expect(getActiveOnDutyIdsFromShift(shift)).toEqual(['a', 'c']);
    expect(resolveOnDutyStaffIds(shift)).toEqual(['a', 'c']);
  });
});

describe('shiftOnDutyRoster', () => {
  test('prevents duplicate active staff', () => {
    const roster = buildOnDutyRosterInitial([{ id: '1', name: 'One' }], ['1'], { role: 'admin' });
    expect(() =>
      appendOnDutyRosterEntry(roster, { staffId: '1', staffName: 'One', actor: { role: 'admin' } })
    ).toThrow(/بالفعل/);
  });

  test('mark removed keeps history entry', () => {
    const roster = buildOnDutyRosterInitial([{ id: '1', name: 'One' }], ['1'], null);
    const next = markOnDutyRosterRemoved(roster, '1', { role: 'admin' });
    expect(next[0].removedAtMs).toBeTruthy();
    expect(getActiveOnDutyIdsFromShift({ onDutyStaffRoster: next })).toEqual([]);
  });
});

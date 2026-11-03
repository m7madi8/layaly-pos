/** @typedef {{ staffId: string, nameSnapshot: string, addedAtMs: number, addedBy: object|null, source?: string, removedAtMs: number|null, removedBy: object|null }} OnDutyRosterEntry */

export function buildOnDutyRosterInitial(staffMembers, staffIds, actor, source = 'shift_open') {
  const atMs = Date.now();
  const uniq = [...new Set((staffIds || []).filter(Boolean))];
  return uniq.map((staffId) => ({
    staffId,
    nameSnapshot: (staffMembers || []).find((s) => s.id === staffId)?.name || '—',
    addedAtMs: atMs,
    addedBy: actor || null,
    source,
    removedAtMs: null,
    removedBy: null,
  }));
}

export function rosterFromLegacyIds(staffMembers, staffIds, actor, source = 'legacy_assign') {
  return buildOnDutyRosterInitial(staffMembers, staffIds, actor, source);
}

export function getActiveOnDutyIdsFromShift(shift) {
  if (!shift) return [];
  if (Array.isArray(shift.onDutyStaffRoster) && shift.onDutyStaffRoster.length > 0) {
    return shift.onDutyStaffRoster
      .filter((e) => e.staffId && !e.removedAtMs)
      .map((e) => e.staffId);
  }
  return [...new Set((shift.onDutyStaffIds || []).filter(Boolean))];
}

/** Everyone who was on duty at any point during the shift (historical names frozen on roster). */
export function buildWorkedStaffSnapshot(shift) {
  if (Array.isArray(shift?.onDutyStaffWorkedSnapshot) && shift.onDutyStaffWorkedSnapshot.length > 0) {
    return shift.onDutyStaffWorkedSnapshot;
  }
  const byId = new Map();
  for (const e of shift?.onDutyStaffRoster || []) {
    if (!e?.staffId) continue;
    byId.set(e.staffId, { staffId: e.staffId, name: e.nameSnapshot || '—' });
  }
  if (byId.size === 0) {
    for (const id of shift?.onDutyStaffIds || []) {
      if (id) byId.set(id, { staffId: id, name: '—' });
    }
  }
  return [...byId.values()];
}

export function isStaffActiveOnShiftRoster(roster, staffId) {
  return (roster || []).some((e) => e.staffId === staffId && !e.removedAtMs);
}

export function appendOnDutyRosterEntry(roster, { staffId, staffName, actor, source = 'mid_shift_add' }) {
  const list = [...(roster || [])];
  if (isStaffActiveOnShiftRoster(list, staffId)) {
    throw new Error('الموظف مداوم بالفعل في هذا الشفت');
  }
  list.push({
    staffId,
    nameSnapshot: staffName || '—',
    addedAtMs: Date.now(),
    addedBy: actor || null,
    source,
    removedAtMs: null,
    removedBy: null,
  });
  return list;
}

export function markOnDutyRosterRemoved(roster, staffId, actor) {
  const list = [...(roster || [])];
  let found = false;
  const next = list.map((e) => {
    if (e.staffId !== staffId || e.removedAtMs) return e;
    found = true;
    return {
      ...e,
      removedAtMs: Date.now(),
      removedBy: actor || null,
    };
  });
  if (!found) throw new Error('الموظف غير مداوم في هذا الشفت');
  return next;
}

export function ensureRosterFromShift(shift, staffMembers, actor) {
  if (Array.isArray(shift.onDutyStaffRoster) && shift.onDutyStaffRoster.length > 0) {
    return [...shift.onDutyStaffRoster];
  }
  return rosterFromLegacyIds(staffMembers, shift.onDutyStaffIds || [], actor, 'migrated');
}

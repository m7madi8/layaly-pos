/** Match checks to a party; legacy docs without partyType count as supplier. */
export function checkMatchesParty(check, partyId, partyType = 'supplier') {
  if (!check || check.partyId !== partyId) return false;
  const stored = check.partyType || 'supplier';
  return stored === partyType;
}

export function filterChecksForParty(checks, partyId, partyType = 'supplier') {
  if (!partyId || !Array.isArray(checks)) return [];
  return checks
    .filter((c) => checkMatchesParty(c, partyId, partyType))
    .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
}

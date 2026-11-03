import { checkMatchesParty, filterChecksForParty } from './checksPartyFilter';

describe('checksPartyFilter', () => {
  const rows = [
    { id: '1', partyId: 's1', partyType: 'supplier', createdAtMs: 3 },
    { id: '2', partyId: 's1', createdAtMs: 2 },
    { id: '3', partyId: 's1', partyType: 'customer', createdAtMs: 1 },
  ];

  test('legacy check without partyType matches supplier', () => {
    expect(checkMatchesParty(rows[1], 's1', 'supplier')).toBe(true);
    expect(checkMatchesParty(rows[1], 's1', 'customer')).toBe(false);
  });

  test('filters and sorts', () => {
    const out = filterChecksForParty(rows, 's1', 'supplier');
    expect(out.map((r) => r.id)).toEqual(['1', '2']);
  });
});

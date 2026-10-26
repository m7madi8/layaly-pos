import { normalizeDocId, assertDocId } from './firestoreIds';

describe('normalizeDocId', () => {
  it('trims strings', () => {
    expect(normalizeDocId('  abc  ')).toBe('abc');
  });

  it('reads id from reference-like objects', () => {
    expect(normalizeDocId({ id: 'cust1' })).toBe('cust1');
    expect(normalizeDocId({ path: 'users/u/customers/cust2' })).toBe('cust2');
  });

  it('returns empty for invalid values', () => {
    expect(normalizeDocId(null)).toBe('');
    expect(normalizeDocId(undefined)).toBe('');
    expect(normalizeDocId('')).toBe('');
  });
});

describe('assertDocId', () => {
  it('throws when id missing', () => {
    expect(() => assertDocId('', 'خطأ')).toThrow('خطأ');
  });
});

import { parseExpenseDate } from './expenseConfig';

describe('parseExpenseDate', () => {
  test('uses dateMs when present', () => {
    const d = parseExpenseDate({ dateMs: Date.UTC(2026, 2, 15, 12, 0, 0) });
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(2);
  });

  test('returns null when no date fields', () => {
    expect(parseExpenseDate({ amount: 10 })).toBeNull();
  });
});

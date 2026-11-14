import { mergeCustomerDirectoryRows, mergeCustomerPair, sumPositiveBalances } from './customerDirectoryMerge';

describe('customerDirectoryMerge', () => {
  test('merges by id and prefers defined balance', () => {
    const merged = mergeCustomerDirectoryRows(
      [{ id: 'a', name: 'أحمد', balance: 0 }],
      [{ id: 'a', name: 'أحمد', balance: 120.5 }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].balance).toBe(120.5);
  });

  test('sumPositiveBalances matches 119 debtors scenario', () => {
    const debtors = Array.from({ length: 119 }, (_, i) => ({
      id: `d${i}`,
      balance: i === 0 ? 10000 : 158.35,
    }));
    const { total, count } = sumPositiveBalances(debtors);
    expect(count).toBe(119);
    expect(total).toBeGreaterThan(0);
  });

  test('mergeCustomerPair keeps longer transactions', () => {
    const a = { id: 'x', balance: 5, transactions: [{ id: '1' }] };
    const b = { id: 'x', balance: 5, transactions: [{ id: '1' }, { id: '2' }] };
    expect(mergeCustomerPair(a, b).transactions).toHaveLength(2);
  });

  test('sorts Arabic names', () => {
    const list = mergeCustomerDirectoryRows(
      [{ id: '2', name: 'ب' }],
      [{ id: '1', name: 'أ' }]
    );
    expect(list.map((c) => c.id)).toEqual(['1', '2']);
  });
});
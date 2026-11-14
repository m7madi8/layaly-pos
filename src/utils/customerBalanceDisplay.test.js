import {
  resolveCustomerBalanceState,
  formatCustomerBalanceDisplay,
} from './customerBalanceDisplay';

const fmt = (n) => `${n.toFixed(2)} ₪`;

describe('customerBalanceDisplay', () => {
  test('known zero', () => {
    const s = resolveCustomerBalanceState({ balance: 0 });
    expect(s.kind).toBe('known_zero');
    expect(formatCustomerBalanceDisplay(fmt, s)).toContain('0.00');
  });

  test('missing balance is not zero', () => {
    const s = resolveCustomerBalanceState({ name: 'x' });
    expect(s.kind).toBe('missing');
    expect(formatCustomerBalanceDisplay(fmt, s)).toBe('غير متوفر');
  });

  test('loading state', () => {
    const s = resolveCustomerBalanceState({ balance: 10 }, { loading: true });
    expect(s.kind).toBe('loading');
  });
});
import {
  findDuplicateCustomer,
  normalizeCustomerPhone,
  normalizeCustomerName,
} from './customerIdentity';
import { uniqueStaffMembersByName } from './employeeBenefitAccounting';

describe('customerIdentity', () => {
  const list = [
    { id: '1', name: '  أحمد  ', phone: '0599-111-222' },
    { id: '2', name: 'سارة', phone: '' },
  ];

  it('matches duplicate phone with different formatting', () => {
    const dup = findDuplicateCustomer(list, { name: 'آخر', phone: '+972599111222' });
    expect(dup?.id).toBe('1');
  });

  it('matches duplicate normalized name', () => {
    const dup = findDuplicateCustomer(list, { name: '  أحمد', phone: '' });
    expect(dup?.id).toBe('1');
  });

  it('normalizes names and phones', () => {
    expect(normalizeCustomerName('  foo   bar ')).toBe('foo bar');
    expect(normalizeCustomerPhone('0599123456')).toBe('599123456');
  });
});

describe('uniqueStaffMembersByName', () => {
  it('keeps one row per staff name', () => {
    const out = uniqueStaffMembersByName([
      { id: 'a', name: 'رامي', benefitLimitILS: 20, active: true },
      { id: 'b', name: '  رامي ', benefitLimitILS: 20, active: true },
    ]);
    expect(out).toHaveLength(1);
  });
});

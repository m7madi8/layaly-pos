import {
  canManageMerchantProfiles,
  canDeleteOrders,
  isFinanceRole,
} from './adminAuth';

describe('merchant profile permissions', () => {
  test('admin and employee can manage merchants', () => {
    expect(canManageMerchantProfiles('admin')).toBe(true);
    expect(canManageMerchantProfiles('employee')).toBe(true);
  });

  test('other roles cannot manage merchants', () => {
    expect(canManageMerchantProfiles(null)).toBe(false);
    expect(canManageMerchantProfiles('guest')).toBe(false);
  });

  test('employee still cannot delete orders', () => {
    expect(canDeleteOrders('employee')).toBe(false);
    expect(canDeleteOrders('admin')).toBe(true);
  });

  test('employee remains finance role for traders tab', () => {
    expect(isFinanceRole('employee')).toBe(true);
  });
});

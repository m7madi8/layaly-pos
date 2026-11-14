import { memberRoleToUiRole, TENANT_ROLES } from './tenantMembershipService';

describe('tenantMembershipService', () => {
  test('maps cashier to employee UI role', () => {
    expect(memberRoleToUiRole(TENANT_ROLES.CASHIER)).toBe('employee');
    expect(memberRoleToUiRole(TENANT_ROLES.ADMIN)).toBe('admin');
  });
});
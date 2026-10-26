const { resolveOrderCallerAccess, isAdminTokenRole } = require('../../functions/lib/authzPolicy');

describe('authzPolicy', () => {
  test('admin and cashier claims always allowed', () => {
    expect(resolveOrderCallerAccess({ tokenRole: 'admin', securityMode: 'hardened' }).allowed).toBe(true);
    expect(resolveOrderCallerAccess({ tokenRole: 'cashier', securityMode: 'hardened' }).allowed).toBe(true);
  });

  test('legacy mode allows callers without claims', () => {
    const r = resolveOrderCallerAccess({ tokenRole: undefined, securityMode: 'legacy' });
    expect(r.allowed).toBe(true);
    expect(r.role).toBe('legacy');
  });

  test('hardened mode denies without admin/cashier claim', () => {
    expect(resolveOrderCallerAccess({ tokenRole: undefined, securityMode: 'hardened' }).allowed).toBe(false);
  });

  test('isAdminTokenRole', () => {
    expect(isAdminTokenRole('admin')).toBe(true);
    expect(isAdminTokenRole('cashier')).toBe(false);
  });
});

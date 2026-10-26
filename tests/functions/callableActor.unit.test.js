const { actorFromAuth, rejectClientSuppliedRole } = require('../../functions/lib/callableActor');

describe('callableActor', () => {
  test('actorFromAuth uses JWT claim only', () => {
    const actor = actorFromAuth({
      auth: { uid: 'u1', token: { role: 'cashier' } },
    });
    expect(actor).toEqual({ uid: 'u1', role: 'cashier' });
  });

  test('actorFromAuth ignores forged body role (body not passed)', () => {
    const actor = actorFromAuth({
      auth: { uid: 'u1', token: {} },
    });
    expect(actor.role).toBeNull();
  });

  test('rejectClientSuppliedRole detects smuggled fields', () => {
    expect(rejectClientSuppliedRole({ role: 'admin' })).toBe(true);
    expect(rejectClientSuppliedRole({ actor: { role: 'admin' } })).toBe(true);
    expect(rejectClientSuppliedRole({ lines: [] })).toBe(false);
  });
});

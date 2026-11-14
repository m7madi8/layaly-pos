const {
  RESTORE_WRITES_ENABLED,
  CLOUD_BACKUP_ENABLED,
  assertCustomerRestoreAllowed,
} = require('../../functions/lib/customerBackupPolicy');

describe('customer backup server policy', () => {
  test('production restore and cloud backup stay disabled', () => {
    expect(RESTORE_WRITES_ENABLED).toBe(false);
    expect(CLOUD_BACKUP_ENABLED).toBe(false);
  });

  test('restore refusal throws and does not accept a writer', () => {
    const writeCustomer = jest.fn();
    expect(() => assertCustomerRestoreAllowed({ writeCustomer })).toThrow(/متوقفة/);
    try {
      assertCustomerRestoreAllowed({ writeCustomer });
    } catch (error) {
      expect(error.code).toBe('restore-disabled');
    }
    expect(writeCustomer).not.toHaveBeenCalled();
  });
});

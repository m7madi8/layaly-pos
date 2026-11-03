import {
  supplierHasFinancialActivity,
  listActiveSuppliers,
} from './supplierProfileService';

describe('supplierProfileService', () => {
  test('detects payment activity', () => {
    expect(
      supplierHasFinancialActivity({ balance: 0 }, 's1', [
        { supplierId: 's1', amount: 10, category: 'SupplierPayment', section: 'supplier_payment' },
      ])
    ).toBe(true);
  });

  test('detects opening balance flag', () => {
    expect(supplierHasFinancialActivity({ openingBalanceRecorded: true, balance: 0 }, 's1', [])).toBe(true);
  });

  test('no activity allows hard delete path', () => {
    expect(supplierHasFinancialActivity({ balance: 0 }, 's1', [])).toBe(false);
  });

  test('filters archived suppliers', () => {
    expect(listActiveSuppliers([{ id: '1' }, { id: '2', archived: true }])).toHaveLength(1);
  });
});

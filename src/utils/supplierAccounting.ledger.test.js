import { supplierLedgerEntries, sumReportExpenses } from './supplierAccounting';
import { PURCHASE_CATEGORY } from '../expenseConfig';

describe('supplier ledger and reports', () => {
  test('ledger distinguishes purchases and payments', () => {
    const expenses = [
      { id: 'p1', supplierId: 's1', section: 'purchase', category: PURCHASE_CATEGORY, amount: 100, date: new Date('2026-01-01') },
      {
        id: 'pay1',
        supplierId: 's1',
        section: 'supplier_payment',
        category: 'SupplierPayment',
        amount: 40,
        paymentMethod: 'Cash',
        paymentRef: 'SP-20260102-ABC',
        date: new Date('2026-01-02'),
      },
    ];
    const ledger = supplierLedgerEntries(expenses, 's1');
    expect(ledger).toHaveLength(2);
    expect(ledger.find((r) => r.kind === 'payment').paymentRef).toBe('SP-20260102-ABC');
    expect(sumReportExpenses(expenses)).toBe(100);
  });
});

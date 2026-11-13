import {
  computeEmployeeObligationsAndEntitlements,
  formatEmployeeNetBalance,
  signedDeltaForLedgerType,
  EMP_LEDGER_TYPES,
} from './employeeAccounting';

describe('employeeAccounting', () => {
  test('net balance = unpaid salary − advances − pos debt', () => {
    const r = computeEmployeeObligationsAndEntitlements({
      accruals: [{ staffMemberId: 'a', amountDue: 2000, amountPaid: 0 }],
      advances: [{ staffMemberId: 'a', balanceRemaining: 300, status: 'open' }],
      posDebts: [{ staffMemberId: 'a', amount: 120, amountRepaid: 0, status: 'open' }],
    });
    expect(r.net).toBe(1580);
  });

  test('formatEmployeeNetBalance', () => {
    expect(formatEmployeeNetBalance(500).label).toBe('مستحق له');
    expect(formatEmployeeNetBalance(-80).label).toBe('عليه دين');
    expect(formatEmployeeNetBalance(0).label).toBe('الحساب مسدد');
  });

  test('signed deltas', () => {
    expect(signedDeltaForLedgerType(EMP_LEDGER_TYPES.SALARY_ACCRUAL, 100)).toBe(100);
    expect(signedDeltaForLedgerType(EMP_LEDGER_TYPES.POS_DEBT, 50)).toBe(-50);
    expect(signedDeltaForLedgerType(EMP_LEDGER_TYPES.BENEFIT, 20)).toBe(0);
  });
});

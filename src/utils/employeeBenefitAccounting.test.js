import {
  DEFAULT_CAFE_STAFF,
  staffNameKey,
  computeBenefitQuota,
  sumApprovedBenefitsUsage,
  resolveBenefitLines,
  validateBenefitInput,
  assertBenefitPermission,
  BENEFIT_STATUS_APPROVED,
  BENEFIT_TYPE_CASH,
  BENEFIT_TYPE_INVENTORY,
} from './employeeBenefitAccounting';

describe('DEFAULT_CAFE_STAFF', () => {
  it('has seven unique staff names', () => {
    const keys = DEFAULT_CAFE_STAFF.map((s) => staffNameKey(s.name));
    expect(keys.length).toBe(7);
    expect(new Set(keys).size).toBe(7);
  });

  it('assigns 20 limit to عمير نمس رامي', () => {
    const map = Object.fromEntries(DEFAULT_CAFE_STAFF.map((s) => [s.name, s.benefitLimitILS]));
    expect(map['عمير']).toBe(20);
    expect(map['نمس']).toBe(20);
    expect(map['رامي']).toBe(20);
  });

  it('assigns 5 limit to رضا وديع مصطفى كنان', () => {
    const map = Object.fromEntries(DEFAULT_CAFE_STAFF.map((s) => [s.name, s.benefitLimitILS]));
    expect(map['رضا']).toBe(5);
    expect(map['وديع']).toBe(5);
    expect(map['مصطفى']).toBe(5);
    expect(map['كنان']).toBe(5);
  });
});

describe('computeBenefitQuota', () => {
  it('allows 5 shekel benefit at limit 5', () => {
    const q = computeBenefitQuota({ limit: 5, used: 0, proposed: 5 });
    expect(q.exceeds).toBe(false);
    expect(q.remaining).toBe(5);
  });

  it('rejects 6 when limit 5 and used 0', () => {
    const q = computeBenefitQuota({ limit: 5, used: 0, proposed: 6 });
    expect(q.exceeds).toBe(true);
  });

  it('combines cash and inventory usage', () => {
    const q = computeBenefitQuota({ limit: 20, used: 15, proposed: 6 });
    expect(q.exceeds).toBe(true);
    expect(q.proposedTotal).toBe(21);
  });

  it('keeps staff usage independent', () => {
    const a = computeBenefitQuota({ limit: 20, used: 18, proposed: 2 });
    const b = computeBenefitQuota({ limit: 5, used: 0, proposed: 5 });
    expect(a.exceeds).toBe(false);
    expect(b.exceeds).toBe(false);
  });
});

describe('sumApprovedBenefitsUsage', () => {
  const benefits = [
    { staffMemberId: 's1', cashDayKey: '2026-10-27', status: BENEFIT_STATUS_APPROVED, totalValue: 5 },
    { staffMemberId: 's1', cashDayKey: '2026-10-27', status: BENEFIT_STATUS_APPROVED, totalValue: 3, benefitType: 'inventory' },
    { staffMemberId: 's2', cashDayKey: '2026-10-27', status: BENEFIT_STATUS_APPROVED, totalValue: 20 },
    { staffMemberId: 's1', cashDayKey: '2026-10-26', status: BENEFIT_STATUS_APPROVED, totalValue: 99 },
    { staffMemberId: 's1', cashDayKey: '2026-10-27', status: 'cancelled', totalValue: 10 },
  ];

  it('sums approved for staff and cash day only', () => {
    expect(sumApprovedBenefitsUsage(benefits, 's1', '2026-10-27')).toBe(8);
    expect(sumApprovedBenefitsUsage(benefits, 's2', '2026-10-27')).toBe(20);
  });
});

describe('resolveBenefitLines', () => {
  const productsById = {
    p1: { id: 'p1', name: 'شيشة', cost: 2, stock: 10, productType: 'standard' },
  };

  it('uses product cost not price', () => {
    const { totalValue, lines } = resolveBenefitLines(productsById, [{ productId: 'p1', quantity: 2 }]);
    expect(totalValue).toBe(4);
    expect(lines[0].lineTotal).toBe(4);
  });
});

describe('validateBenefitInput', () => {
  const staff = { id: 's1', name: 'رضا', benefitLimitILS: 5, active: true };

  it('rejects exceed without override', () => {
    expect(() =>
      validateBenefitInput({
        staffMember: staff,
        benefitType: BENEFIT_TYPE_CASH,
        cashAmount: 6,
        usedToday: 0,
        actor: { role: 'admin' },
      })
    ).toThrow(/تجاوز/);
  });

  it('allows admin override with reason', () => {
    const v = validateBenefitInput({
      staffMember: staff,
      benefitType: BENEFIT_TYPE_CASH,
      cashAmount: 6,
      usedToday: 0,
      override: true,
      overrideReason: 'ضيف مهم',
      actor: { role: 'admin' },
    });
    expect(v.override).toBe(true);
    expect(v.proposed).toBe(6);
  });

  it('rejects employee role', () => {
    expect(() =>
      assertBenefitPermission({ role: 'employee' })
    ).toThrow(/صلاحية غير كافية/);
  });
});

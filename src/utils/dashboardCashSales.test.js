import {
  getLocalCalendarDayStart,
  orderCashCollected,
  orderDebtRecorded,
  computeTodayCashSales,
  computeTodayCardSales,
  computeTodayDebtSales,
  orderCardCollected,
  sumTodayCardDebtRepaymentsFromShifts,
  isOrderOnOrAfterDayStart,
} from './dashboardCashSales';

const ts = (date) => ({ toDate: () => date });

describe('orderCashCollected', () => {
  test('cash-only paid order', () => {
    expect(orderCashCollected({ status: 'paid', paymentType: 'cash', cashPaid: 45 })).toBe(45);
  });

  test('mixed order — cash portion only', () => {
    expect(
      orderCashCollected({
        status: 'partial',
        paymentType: 'mixed',
        cashPaid: 20,
        debtAmount: 30,
        total: 50,
      })
    ).toBe(20);
  });

  test('debt-only order', () => {
    expect(
      orderCashCollected({ status: 'unpaid', paymentType: 'debt', cashPaid: 0, debtAmount: 50 })
    ).toBe(0);
  });

  test('cancelled cash order excluded', () => {
    expect(orderCashCollected({ status: 'cancelled', cashPaid: 100 })).toBe(0);
  });

  test('compliment — zero cash', () => {
    expect(
      orderCashCollected({ status: 'paid', paymentType: 'compliment', paymentMethod: 'Compliment', total: 0 })
    ).toBe(0);
  });
});

describe('orderDebtRecorded / computeTodayDebtSales', () => {
  const dayStart = new Date(2026, 9, 26, 0, 0, 0, 0);
  const todayNoon = new Date(2026, 9, 26, 12, 0, 0);
  const yesterday = new Date(2026, 9, 25, 23, 0, 0);

  test('debt and mixed portions', () => {
    expect(
      orderDebtRecorded({
        status: 'unpaid',
        customerId: 'c1',
        debtAmount: 50,
      })
    ).toBe(50);
    expect(
      orderDebtRecorded({
        status: 'partial',
        customerId: 'c1',
        cashPaid: 20,
        debtAmount: 30,
      })
    ).toBe(30);
    expect(orderDebtRecorded({ status: 'cancelled', customerId: 'c1', debtAmount: 10 })).toBe(0);
    expect(orderDebtRecorded({ status: 'unpaid', debtAmount: 10 })).toBe(0);
  });

  test('sums today debt; excludes yesterday and cancelled', () => {
    const orders = [
      { status: 'unpaid', customerId: 'c1', debtAmount: 40, timestamp: ts(todayNoon) },
      { status: 'partial', customerId: 'c1', cashPaid: 10, debtAmount: 15, timestamp: ts(todayNoon) },
      { status: 'cancelled', customerId: 'c1', debtAmount: 99, timestamp: ts(todayNoon) },
      { status: 'unpaid', customerId: 'c1', debtAmount: 20, timestamp: ts(yesterday) },
      { status: 'paid', cashPaid: 100, debtAmount: 0, timestamp: ts(todayNoon) },
    ];
    expect(computeTodayDebtSales(orders, dayStart)).toBe(55);
  });
});

describe('orderCardCollected / computeTodayCardSales', () => {
  const dayStart = new Date(2026, 9, 26, 0, 0, 0, 0);
  const todayNoon = new Date(2026, 9, 26, 12, 0, 0);

  test('card paid order does not count as cash', () => {
    expect(orderCardCollected({ status: 'paid', paymentType: 'card', cardPaid: 60, total: 60 })).toBe(60);
    expect(
      orderCashCollected({ status: 'paid', paymentType: 'card', cardPaid: 60, cashPaid: 0, total: 60 })
    ).toBe(0);
  });

  test('sums today card sales', () => {
    const orders = [
      { status: 'paid', paymentType: 'card', cardPaid: 40, timestamp: ts(todayNoon) },
      { status: 'paid', paymentType: 'cash', cashPaid: 30, timestamp: ts(todayNoon) },
    ];
    expect(computeTodayCardSales(orders, dayStart)).toBe(40);
  });
});

describe('computeTodayCashSales', () => {
  const dayStart = new Date(2026, 9, 26, 0, 0, 0, 0);
  const todayNoon = new Date(2026, 9, 26, 12, 0, 0);
  const yesterday = new Date(2026, 9, 25, 23, 0, 0);

  test('sums today non-cancelled cash; excludes yesterday and cancelled', () => {
    const orders = [
      { status: 'paid', cashPaid: 100, timestamp: ts(todayNoon) },
      { status: 'partial', cashPaid: 25, timestamp: ts(todayNoon) },
      { status: 'cancelled', cashPaid: 40, timestamp: ts(todayNoon) },
      { status: 'paid', cashPaid: 200, timestamp: ts(yesterday) },
      { status: 'unpaid', cashPaid: 0, debtAmount: 30, timestamp: ts(todayNoon) },
    ];
    expect(computeTodayCashSales(orders, dayStart)).toBe(125);
  });

  test('cancelled order refund effect — net zero from that sale', () => {
    const orders = [
      { status: 'cancelled', cashPaid: 80, timestamp: ts(todayNoon) },
    ];
    expect(computeTodayCashSales(orders, dayStart)).toBe(0);
  });
});

describe('sumTodayCardDebtRepaymentsFromShifts', () => {
  const dayStart = new Date(2026, 9, 26, 0, 0, 0, 0);
  const todayMs = new Date(2026, 9, 26, 14, 0, 0).getTime();

  test('sums card debt repayments on shifts anchored today', () => {
    const shifts = [
      { status: 'open', openedAtMs: todayMs, cardDebtRepayments: 30 },
      { status: 'closed', closedAtMs: todayMs, cardDebtRepayments: 20 },
      { status: 'closed', closedAtMs: new Date(2026, 9, 25).getTime(), cardDebtRepayments: 99 },
    ];
    expect(sumTodayCardDebtRepaymentsFromShifts(shifts, dayStart)).toBe(50);
  });
});

describe('getLocalCalendarDayStart', () => {
  test('aligns with dashboard midnight boundary', () => {
    const now = new Date(2026, 9, 26, 15, 30, 0);
    const start = getLocalCalendarDayStart(now);
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(26);
    expect(isOrderOnOrAfterDayStart({ timestamp: ts(new Date(2026, 9, 25, 23, 59, 0)) }, start)).toBe(false);
    expect(isOrderOnOrAfterDayStart({ timestamp: ts(new Date(2026, 9, 26, 0, 0, 0)) }, start)).toBe(true);
  });
});

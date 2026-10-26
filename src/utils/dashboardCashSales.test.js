import {
  getLocalCalendarDayStart,
  orderCashCollected,
  computeTodayCashSales,
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

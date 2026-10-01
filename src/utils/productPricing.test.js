import {
  amountFromWeight,
  weightFromAmount,
  weightPricePerUnit,
  billableMinutes,
  timePrice,
  electricityCost,
  stockUnitsForItem,
  getProductType,
  validateWeightPricing,
  validateTimePricing,
  costFromWeight,
  summarizePlaystationSessions,
} from './productPricing';

describe('playstation report summary', () => {
  const day = new Date(2026, 8, 30, 12).getTime();
  const sessions = [
    { status: 'ended', endedAtMs: day, durationMinutes: 60, price: 12, billed: true, electricityCostPerHour: 1.5, stationName: 'جهاز 1' },
    { status: 'ended', endedAtMs: day, durationMinutes: 30, price: 6, billed: false, electricityCostPerHour: 1.5, stationName: 'جهاز 2' },
    { status: 'ended', endedAtMs: day, durationMinutes: 120, price: 24, billed: true, stationName: 'جهاز 1' },
    { status: 'active', startedAtMs: day, stationName: 'جهاز 3' },
    { status: 'cancelled', endedAtMs: day, durationMinutes: 50, stationName: 'جهاز 3' },
    { status: 'ended', endedAtMs: day - 3 * 86400000, durationMinutes: 60, price: 12, billed: true, stationName: 'جهاز 1' },
  ];
  const sameDay = (d) => d.toDateString() === new Date(day).toDateString();
  const r = summarizePlaystationSessions(sessions, sameDay, 2);

  test('only ended sessions in period', () => expect(r.sessionCount).toBe(3));
  test('total hours', () => expect(r.totalHours).toBe(3.5));
  test('revenue counts billed only', () => expect(r.revenue).toBe(36));
  test('unbilled tracked separately', () => {
    expect(r.unbilledCount).toBe(1);
    expect(r.unbilledValue).toBe(6);
  });
  test('electricity uses per-session snapshot, falls back to setting', () => expect(r.electricity).toBe(1.5 + 0.75 + 4));
  test('net after electricity', () => expect(r.net).toBe(36 - 6.25));
  test('per station breakdown', () => {
    const s1 = r.byStation.find((x) => x.station === 'جهاز 1');
    expect(s1.sessions).toBe(2);
    expect(s1.revenue).toBe(36);
  });
});

const weightProduct = { productType: 'weight', weightPricing: { baseWeight: 2, basePrice: 1 }, cost: 0.4 };
const ps = { billingMinutes: 15, billingPrice: 3, rounding: 'up' };

describe('weight pricing (1₪ per 2g)', () => {
  test('price per gram', () => expect(weightPricePerUnit(weightProduct)).toBe(0.5));
  test.each([
    [2, 1],
    [10, 5],
    [20, 10],
    [30, 15],
    [35, 17.5],
  ])('%sg → %s₪', (g, amount) => expect(amountFromWeight(weightProduct, g)).toBe(amount));
  test.each([
    [5, 10],
    [10, 20],
    [15, 30],
  ])('%s₪ → %sg', (amount, g) => expect(weightFromAmount(weightProduct, amount)).toBe(g));
  test('rejects zero and negative', () => {
    expect(amountFromWeight(weightProduct, 0)).toBe(0);
    expect(amountFromWeight(weightProduct, -5)).toBe(0);
    expect(weightFromAmount(weightProduct, -1)).toBe(0);
  });
  test('cost scales with weight', () => expect(costFromWeight(weightProduct, 20)).toBe(4));
  test('validation', () => {
    expect(validateWeightPricing({ baseWeight: 0, basePrice: 1 })).toBeTruthy();
    expect(validateWeightPricing({ baseWeight: 2, basePrice: -1 })).toBeTruthy();
    expect(validateWeightPricing({ baseWeight: 2, basePrice: 1 })).toBeNull();
  });
});

describe('time pricing (3₪ per 15 min)', () => {
  test.each([
    [15, 3],
    [30, 6],
    [45, 9],
    [60, 12],
  ])('%s min → %s₪', (m, price) => expect(timePrice(ps, m)).toBe(price));
  test('round up to next unit by default', () => {
    expect(billableMinutes(16, 15)).toBe(30);
    expect(timePrice(ps, 1)).toBe(3);
    expect(timePrice({ billingMinutes: 15, billingPrice: 3 }, 61)).toBe(15);
  });
  test('exact billing', () => {
    expect(timePrice({ ...ps, rounding: 'exact' }, 20)).toBe(4);
  });
  test('no charge for zero or negative duration', () => {
    expect(timePrice(ps, 0)).toBe(0);
    expect(timePrice(ps, -10)).toBe(0);
  });
  test('validation', () => {
    expect(validateTimePricing({ billingMinutes: 0, billingPrice: 3 })).toBeTruthy();
    expect(validateTimePricing(ps)).toBeNull();
  });
});

describe('electricity', () => {
  test('60h × 1.5 = 90', () => expect(electricityCost(60 * 60, 1.5)).toBe(90));
  test('100h × 1.5 = 150', () => expect(electricityCost(100 * 60, 1.5)).toBe(150));
});

describe('stock units', () => {
  test('legacy products default to standard', () => expect(getProductType({})).toBe('standard'));
  test('standard uses quantity', () => expect(stockUnitsForItem({ quantity: 3 })).toBe(3));
  test('weight uses grams', () => expect(stockUnitsForItem({ productType: 'weight', weightGrams: 20, quantity: 1 })).toBe(20));
  test('time uses none', () => expect(stockUnitsForItem({ productType: 'time', quantity: 1 })).toBe(0));
});

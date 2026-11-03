import { computeEmployeeUnitPrice } from './employeePricing';

describe('employeePricing', () => {
  test('employee price is cost + half margin', () => {
    const r = computeEmployeeUnitPrice({ price: 20, cost: 10, productType: 'standard' });
    expect(r.employeePrice).toBe(15);
    expect(r.cost).toBe(10);
  });

  test('weight products use weightPricing sell for half-margin', () => {
    const product = {
      price: 0,
      cost: 10,
      productType: 'weight',
      weightPricing: { baseWeight: 100, basePrice: 20 },
    };
    const r = computeEmployeeUnitPrice(product, { weightGrams: 100 });
    expect(r.sellPrice).toBe(20);
    expect(r.cost).toBe(10);
    expect(r.employeePrice).toBe(15);
  });
});

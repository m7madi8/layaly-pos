import { computeEmployeeUnitPrice } from './employeePricing';

describe('employeePricing', () => {
  test('employee price is cost + half margin', () => {
    const r = computeEmployeeUnitPrice({ price: 20, cost: 10, productType: 'standard' });
    expect(r.employeePrice).toBe(15);
    expect(r.cost).toBe(10);
  });
});

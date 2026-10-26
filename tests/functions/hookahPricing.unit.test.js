const { externalHookahUnitPrice } = require('../../functions/lib/hookahExternalSale');

describe('external hookah server pricing', () => {
  test('plain نخلة with hookah-external line id → 20', () => {
    expect(externalHookahUnitPrice({ name: 'نخلة', price: 15 }, 'abc::hookah-external')).toBe(20);
  });

  test('تجديد نخلة is not overridden', () => {
    expect(externalHookahUnitPrice({ name: 'تجديد نخلة', price: 15 }, 'x::hookah-external')).toBeNull();
  });

  test('regular line uses catalog price path (null override)', () => {
    expect(externalHookahUnitPrice({ name: 'نخلة', price: 15 }, 'p1')).toBeNull();
  });
});

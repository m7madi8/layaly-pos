import { remainingReturnableQty, validatePartialReturnQuantity } from './orderReturn';

describe('orderReturn caps', () => {
  test('remainingReturnableQty subtracts prior returns', () => {
    expect(remainingReturnableQty({ quantity: 5, returnedQty: 2 })).toBe(3);
    expect(remainingReturnableQty({ quantity: 1 })).toBe(1);
    expect(remainingReturnableQty({ quantity: 2, returnedQty: 2 })).toBe(0);
  });

  test('validatePartialReturnQuantity rejects over-cap and zero', () => {
    const line = { quantity: 4, returnedQty: 1 };
    expect(validatePartialReturnQuantity(line, 0).ok).toBe(false);
    expect(validatePartialReturnQuantity(line, 3).ok).toBe(true);
    const over = validatePartialReturnQuantity(line, 4);
    expect(over.ok).toBe(false);
    expect(over.message).toMatch(/3 متبقي/);
  });
});

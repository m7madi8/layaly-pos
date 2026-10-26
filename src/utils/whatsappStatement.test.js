import { toWhatsAppDigits, buildCustomerStatementWhatsAppUrl } from './whatsappStatement';

describe('toWhatsAppDigits', () => {
  test('normalizes a local Palestinian mobile', () => {
    expect(toWhatsAppDigits('0595360982')).toBe('970595360982');
    expect(toWhatsAppDigits('+970 59 536 0982')).toBe('970595360982');
    expect(toWhatsAppDigits('00970595360982')).toBe('970595360982');
  });

  test('rejects empty or too-short numbers', () => {
    expect(toWhatsAppDigits('')).toBeNull();
    expect(toWhatsAppDigits('123')).toBeNull();
  });
});

describe('buildCustomerStatementWhatsAppUrl', () => {
  test('opens a chat with the customer and the statement text', () => {
    const url = buildCustomerStatementWhatsAppUrl('0591111111', 'كشف حساب');
    expect(url).toBe('https://wa.me/970591111111?text=%D9%83%D8%B4%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8');
  });
});

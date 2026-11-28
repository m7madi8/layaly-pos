/** معرّف حركة خزنة ثابت لكل شفت — يمنع التكرار ويُربط بالقواعد. */
export function closeVaultMovementId(shiftId) {
  const sid = String(shiftId || '').trim();
  if (!sid) return '';
  return `from_cash_close_${sid}`;
}

/** حركة صندوق إغلاق → خزنة (نفس المعاملة الذرية). */
export function closeCashDrawerMovementId(shiftId) {
  const sid = String(shiftId || '').trim();
  if (!sid) return '';
  return `shift_close_vault_${sid}`;
}
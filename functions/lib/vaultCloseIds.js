function closeVaultMovementId(shiftId) {
  const sid = String(shiftId || '').trim();
  if (!sid) return '';
  return `from_cash_close_${sid}`;
}

function closeCashDrawerMovementId(shiftId) {
  const sid = String(shiftId || '').trim();
  if (!sid) return '';
  return `shift_close_vault_${sid}`;
}

module.exports = { closeVaultMovementId, closeCashDrawerMovementId };
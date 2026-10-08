/** رمز دخول الخزنة (أرقام فقط) — يمكن تغييره عبر REACT_APP_VAULT_PIN */
export const VAULT_PIN = String(process.env.REACT_APP_VAULT_PIN || '1221').trim();

export function isVaultPinValid(digits) {
  return String(digits || '').trim() === VAULT_PIN;
}

import { resolveVaultPin } from './config/authSecrets';

/** أقصى طول لإدخال الرمز في الواجهة (لا يُعرض الرمز الفعلي). */
export function getVaultPinInputLength() {
  const pin = resolveVaultPin();
  return pin ? pin.length : 6;
}

export function isVaultPinValid(digits) {
  const expected = resolveVaultPin();
  if (!expected) return false;
  return String(digits || '').trim() === expected;
}

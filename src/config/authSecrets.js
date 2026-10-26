/** Dev-only fallbacks — never used in production builds (see validateProductionEnv). */
const DEV_EMPLOYEE_FALLBACK = 'admin123';
const DEV_VAULT_FALLBACK = '1221';

export function resolveEmployeeLoginPassword() {
  const fromEnv = String(process.env.REACT_APP_EMPLOYEE_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return DEV_EMPLOYEE_FALLBACK;
  return '';
}

export function resolveVaultPin() {
  const fromEnv = String(process.env.REACT_APP_VAULT_PIN || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return DEV_VAULT_FALLBACK;
  return '';
}

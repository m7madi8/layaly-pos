import { isDemoMode, isFirebaseConfigured } from '../firebaseClient';

const BLOCKED_EMPLOYEE_PASSWORDS = new Set(['admin123', 'password', '123456', '']);
const BLOCKED_VAULT_PINS = new Set(['1221', '0000', '1234', '']);

/**
 * Fails the production build when demo is off and secrets are missing or known defaults.
 * Does not log secret values.
 */
export function assertProductionSecretsConfigured() {
  if (process.env.NODE_ENV !== 'production') return;
  if (isDemoMode || !isFirebaseConfigured) return;

  const employee = String(process.env.REACT_APP_EMPLOYEE_PASSWORD || '').trim();
  const vault = String(process.env.REACT_APP_VAULT_PIN || '').trim();

  const errors = [];
  if (!employee || BLOCKED_EMPLOYEE_PASSWORDS.has(employee)) {
    errors.push('REACT_APP_EMPLOYEE_PASSWORD must be set to a strong non-default value for production builds.');
  }
  if (!vault || BLOCKED_VAULT_PINS.has(vault)) {
    errors.push('REACT_APP_VAULT_PIN must be set to a non-default value for production builds.');
  }

  if (errors.length) {
    throw new Error(`[Layali POS security] ${errors.join(' ')}`);
  }
}

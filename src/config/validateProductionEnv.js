const BLOCKED_EMPLOYEE_PASSWORDS = new Set(['admin123', 'password', '123456', '']);
const BLOCKED_VAULT_PINS = new Set(['1221', '0000', '1234', '']);

const FIREBASE_ENV_KEYS = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

function envValue(env, key) {
  return String((env && env[key]) || '').trim();
}

/**
 * Returns production-secret errors for a given env object. Does not log secret values.
 * Keep blocked-value lists in sync with scripts/assert-production-env.js.
 */
export function collectProductionSecretErrors(env = process.env) {
  if (envValue(env, 'NODE_ENV') !== 'production') return [];
  if (envValue(env, 'REACT_APP_DEMO_MODE').toLowerCase() === 'true') return [];

  const firebaseConfigured = FIREBASE_ENV_KEYS.every((key) => envValue(env, key));
  if (!firebaseConfigured) return [];

  const errors = [];
  const employee = envValue(env, 'REACT_APP_EMPLOYEE_PASSWORD');
  const vault = envValue(env, 'REACT_APP_VAULT_PIN');

  if (!employee || BLOCKED_EMPLOYEE_PASSWORDS.has(employee)) {
    errors.push('REACT_APP_EMPLOYEE_PASSWORD must be set to a strong non-default value for production builds.');
  }
  if (!vault || BLOCKED_VAULT_PINS.has(vault)) {
    errors.push('REACT_APP_VAULT_PIN must be set to a non-default value for production builds.');
  }

  return errors;
}

/**
 * Fails production startup when demo is off, Firebase is configured, and secrets are missing or known defaults.
 */
export function assertProductionSecretsConfigured() {
  const errors = collectProductionSecretErrors(process.env);
  if (errors.length) {
    throw new Error(`[Layali POS security] ${errors.join(' ')}`);
  }
}

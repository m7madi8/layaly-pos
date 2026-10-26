import { collectProductionSecretErrors } from './validateProductionEnv';

const firebaseEnv = {
  REACT_APP_FIREBASE_API_KEY: 'test-key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: 'example-project',
  REACT_APP_FIREBASE_STORAGE_BUCKET: 'example.appspot.com',
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '123',
  REACT_APP_FIREBASE_APP_ID: '1:123:web:abc',
};

describe('collectProductionSecretErrors', () => {
  test('skips non-production builds', () => {
    expect(
      collectProductionSecretErrors({
        NODE_ENV: 'development',
        ...firebaseEnv,
      })
    ).toEqual([]);
  });

  test('skips demo mode', () => {
    expect(
      collectProductionSecretErrors({
        NODE_ENV: 'production',
        REACT_APP_DEMO_MODE: 'true',
        ...firebaseEnv,
      })
    ).toEqual([]);
  });

  test('skips when Firebase is not configured', () => {
    expect(
      collectProductionSecretErrors({
        NODE_ENV: 'production',
        REACT_APP_DEMO_MODE: 'false',
      })
    ).toEqual([]);
  });

  test('fails when production secrets are missing', () => {
    const errors = collectProductionSecretErrors({
      NODE_ENV: 'production',
      REACT_APP_DEMO_MODE: 'false',
      ...firebaseEnv,
    });
    expect(errors).toHaveLength(2);
  });

  test('fails on known default secrets', () => {
    const errors = collectProductionSecretErrors({
      NODE_ENV: 'production',
      REACT_APP_DEMO_MODE: 'false',
      REACT_APP_EMPLOYEE_PASSWORD: 'admin123',
      REACT_APP_VAULT_PIN: '1221',
      ...firebaseEnv,
    });
    expect(errors).toHaveLength(2);
  });

  test('passes when strong non-default secrets are set', () => {
    expect(
      collectProductionSecretErrors({
        NODE_ENV: 'production',
        REACT_APP_DEMO_MODE: 'false',
        REACT_APP_EMPLOYEE_PASSWORD: 'LayaliStaff',
        REACT_APP_VAULT_PIN: '861501',
        ...firebaseEnv,
      })
    ).toEqual([]);
  });
});

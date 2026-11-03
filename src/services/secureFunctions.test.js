import { isCloudCallableUnavailableError, isTrustedOrdersEnabled } from './secureFunctions';

describe('isCloudCallableUnavailableError', () => {
  test('detects network and functions errors', () => {
    expect(isCloudCallableUnavailableError({ code: 'functions/unavailable' })).toBe(true);
    expect(isCloudCallableUnavailableError(new Error('Failed to fetch'))).toBe(true);
    expect(isCloudCallableUnavailableError({ code: 'functions/permission-denied' })).toBe(false);
    expect(
      isCloudCallableUnavailableError(new TypeError("Cannot read properties of undefined (reading 'path')"))
    ).toBe(true);
  });
});

describe('trusted flags require CLOUD_FUNCTIONS_READY', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  test('TRUSTED_ORDERS off without ready flag', () => {
    process.env.REACT_APP_TRUSTED_ORDERS = 'true';
    process.env.REACT_APP_DEMO_MODE = 'false';
    delete process.env.REACT_APP_CLOUD_FUNCTIONS_READY;
    expect(isTrustedOrdersEnabled()).toBe(false);
  });
});

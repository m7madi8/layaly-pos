import { isCloudCallableUnavailableError } from './secureFunctions';

describe('isCloudCallableUnavailableError', () => {
  test('detects network and functions errors', () => {
    expect(isCloudCallableUnavailableError({ code: 'functions/unavailable' })).toBe(true);
    expect(isCloudCallableUnavailableError(new Error('Failed to fetch'))).toBe(true);
    expect(isCloudCallableUnavailableError({ code: 'functions/permission-denied' })).toBe(false);
  });
});

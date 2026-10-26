import { isProductionFirebaseProjectId } from './validateStagingEnv';
import { KNOWN_PRODUCTION_PROJECT_ID } from './knownProductionProject';

describe('validateStagingEnv helpers', () => {
  test('detects production project id', () => {
    expect(isProductionFirebaseProjectId(KNOWN_PRODUCTION_PROJECT_ID)).toBe(true);
    expect(isProductionFirebaseProjectId('layali-cafe-staging-example')).toBe(false);
  });
});

/**
 * Optional guard for staging builds — fails fast if the SPA targets the known production Firebase project.
 * Enable with REACT_APP_STAGING_BUILD=true in staging hosting env only (never production).
 */
import { isDemoMode, isFirebaseConfigured } from '../firebaseClient';
import { KNOWN_PRODUCTION_PROJECT_ID } from './knownProductionProject';

export function isProductionFirebaseProjectId(projectId) {
  return String(projectId || '').trim() === KNOWN_PRODUCTION_PROJECT_ID;
}

export function assertStagingTargetsNonProductionProject() {
  if (process.env.REACT_APP_STAGING_BUILD !== 'true') return;
  if (isDemoMode || !isFirebaseConfigured) return;

  const projectId = String(process.env.REACT_APP_FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) return;

  if (isProductionFirebaseProjectId(projectId)) {
    throw new Error(
      '[Layali POS staging] REACT_APP_FIREBASE_PROJECT_ID must point to a dedicated staging Firebase project, not production.'
    );
  }

  const trustedOn =
    process.env.REACT_APP_TRUSTED_ORDERS === 'true' ||
    process.env.REACT_APP_TRUSTED_CASH_SHIFTS === 'true';
  if (trustedOn && isProductionFirebaseProjectId(projectId)) {
    throw new Error('[Layali POS staging] Trusted callables cannot be enabled against the production project.');
  }
}

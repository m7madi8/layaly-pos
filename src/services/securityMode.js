/** Tenant uses server-enforced financial writes (Firestore hardened + callables). */
export function isHardenedFinancialMode(profile) {
  return profile?.securityMode === 'hardened';
}

export function mustUseFinancialCallables(profile) {
  if (isHardenedFinancialMode(profile)) return true;
  return process.env.REACT_APP_USE_FINANCIAL_CALLABLES === 'true';
}

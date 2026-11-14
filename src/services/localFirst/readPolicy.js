/**
 * Firestore read strategy per collection (Layali POS).
 * @typedef {'CACHE_ONLY'|'CACHE_FIRST'|'NETWORK_ON_DEMAND'|'REALTIME_CRITICAL'} ReadPolicy
 */

export const READ_POLICY = {
  products: 'REALTIME_CRITICAL',
  orders: 'REALTIME_CRITICAL',
  cashShifts: 'REALTIME_CRITICAL',
  openBills: 'REALTIME_CRITICAL',
  vault: 'REALTIME_CRITICAL',
  cashMovements: 'NETWORK_ON_DEMAND',
  vaultMovements: 'NETWORK_ON_DEMAND',
  staffMembers: 'CACHE_FIRST',
  customers: 'CACHE_FIRST',
  suppliers: 'CACHE_FIRST',
  expenses: 'REALTIME_CRITICAL',
  employeeBenefits: 'CACHE_FIRST',
  ingredients: 'NETWORK_ON_DEMAND',
  businessDaySummaries: 'CACHE_ONLY',
  playstationSessions: 'REALTIME_CRITICAL',
};

export function describePolicy(collectionKey) {
  return READ_POLICY[collectionKey] || 'NETWORK_ON_DEMAND';
}
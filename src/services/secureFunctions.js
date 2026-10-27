/**
 * Callable Cloud Functions (Phase 1 scaffold).
 * Safe to import when Functions are not deployed — callers should catch and fall back to legacy client paths.
 */
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { isDemoMode, isFirebaseConfigured } from '../firebaseClient';

let emulatorConnected = false;

function functionsInstance() {
  if (!isFirebaseConfigured || isDemoMode) return null;
  const app = getApp();
  const region = process.env.REACT_APP_FUNCTIONS_REGION || 'europe-west1';
  const fns = getFunctions(app, region);
  if (process.env.REACT_APP_FUNCTIONS_EMULATOR === 'true' && !emulatorConnected) {
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return fns;
}

export async function callResetSalesAndCustomerLedgers() {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'resetSalesAndCustomerLedgers');
  const result = await fn({ confirm: true, preserveCustomerLedgers: true });
  return result.data;
}

export async function callVerifyEmployeePin(pin) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'verifyEmployeePin');
  const result = await fn({ pin });
  return result.data;
}

export function isTrustedOrdersEnabled() {
  return (
    process.env.REACT_APP_TRUSTED_ORDERS === 'true' &&
    process.env.REACT_APP_DEMO_MODE !== 'true'
  );
}

export async function callCompleteOrder(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'completeOrder');
  const result = await fn(payload);
  return result.data;
}

export async function callCancelOrder(orderId) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'cancelOrder');
  const result = await fn({ orderId });
  return result.data;
}

export function isTestDataRemovalCloudEnabled() {
  return isFirebaseConfigured && !isDemoMode;
}

export async function callPreviewRemoveTestSales() {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'previewRemoveTestSales');
  const result = await fn({});
  return result.data;
}

export async function callExecuteRemoveTestSales(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'executeRemoveTestSales');
  const result = await fn(payload);
  return result.data;
}

export async function callUpdateTestDataRegistry(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'updateTestDataRegistry');
  const result = await fn(payload);
  return result.data;
}

export async function callMarkOrdersAsTestData(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'markOrdersAsTestData');
  const result = await fn(payload);
  return result.data;
}

export function isTrustedCashShiftsEnabled() {
  return (
    process.env.REACT_APP_TRUSTED_CASH_SHIFTS === 'true' &&
    process.env.REACT_APP_DEMO_MODE !== 'true'
  );
}

export async function callOpenCashShift(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'openCashShift');
  const result = await fn(payload);
  return result.data;
}

export async function callCloseCashShift(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'closeCashShift');
  const result = await fn(payload);
  return result.data;
}

export async function callRecordCashShiftMovement(payload) {
  const fns = functionsInstance();
  if (!fns) throw new Error('الدوال السحابية غير متاحة');
  const fn = httpsCallable(fns, 'recordCashShiftMovement');
  const result = await fn(payload);
  return result.data;
}

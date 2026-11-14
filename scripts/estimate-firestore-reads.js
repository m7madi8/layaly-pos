#!/usr/bin/env node
/**
 * Static session read estimator for Layali POS listener policy.
 * Does NOT connect to Firebase — models first snapshot + incremental updates.
 *
 * Usage: node scripts/estimate-firestore-reads.js [employee|admin-day|admin-dash]
 */

'use strict';

const PRODUCTS = 120;
const STAFF = 15;
const SUPPLIERS = 25;
const CUSTOMERS = 80;
const EXPENSES = { expenses: 400, purchases: 800, traders: 800, cash: 350, reports: 500 };
const ORDERS = { 'employee-pos': 80, 'employee-pos-open': 40, dashboard: 150, ordersToday: 200, reports: 400 };
const BENEFITS = 250;
const CASH_SHIFTS = 30;
const CASH_MOVEMENTS = 200;
const VAULT_MOVES = 200;
const PS_SESSIONS = 80;
const ASSETS = 60;
const ASSET_MOVES = 100;
const OPEN_BILLS = 50;

function employeeDay() {
  let reads = 1; // profile
  reads += PRODUCTS; // POS all day
  reads += ORDERS['employee-pos']; // today orders on POS
  reads += ORDERS['employee-pos-open']; // unpaid/partial from any day
  reads += STAFF; // expenses + pos + cash navigation (single staff listener)
  reads += EXPENSES.expenses; // expenses screen time
  reads += SUPPLIERS; // purchases/traders
  reads += BENEFITS;
  reads += CASH_SHIFTS;
  reads += 1; // vault doc on finance views
  reads += PS_SESSIONS;
  reads += ASSETS + ASSET_MOVES;
  reads += CUSTOMERS;
  reads += OPEN_BILLS;
  // ~100 order writes → ~100 incremental snapshot reads (1 doc each)
  reads += 100;
  return { scenario: 'employee-full-day', estimatedBillableReads: reads };
}

function adminDashboardVisit() {
  let reads = 1 + PRODUCTS + ORDERS.dashboard + STAFF + CASH_SHIFTS;
  return { scenario: 'admin-dashboard-15min', estimatedBillableReads: reads };
}

function adminMixedDay() {
  const base = adminDashboardVisit().estimatedBillableReads;
  const extra = EXPENSES.expenses + SUPPLIERS + ORDERS.ordersToday + BENEFITS + VAULT_MOVES;
  return { scenario: 'admin-mixed-day', estimatedBillableReads: base + extra };
}

const mode = process.argv[2] || 'employee';
const out =
  mode === 'admin-dash'
    ? adminDashboardVisit()
    : mode === 'admin-day'
      ? adminMixedDay()
      : employeeDay();

console.log(JSON.stringify(out, null, 2));
console.log(
  '\nCompare Firebase Console Usage before/after optimization. In-app: Settings → مراقبة قراءات Firestore.'
);
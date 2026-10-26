# Production acceptance report — Layali Café POS

**Date:** 2026-10-26  
**Environment tested:** **None** (isolated staging acceptance **not executed**).  
**Verdict:** **ACCEPTANCE BLOCKED** — prerequisite staging validation was never completed.

---

## 1. Purpose

This document records **pre-production acceptance** results required before deploying to `layaly-cafe-13c2b` or shipping a production APK.

Per release policy: acceptance must run on **isolated staging** with realistic accounts, persisted-state verification, and documented outcomes.

---

## 2. Release gate status (from prior audits)

| Gate | Required state | Actual state | Pass? |
|------|----------------|--------------|-------|
| Trusted employee/admin authorization on sensitive ops | JWT claims + hardened mode + dual users | Default: `localStorage` role; PIN ≠ claim; legacy Firestore writes | **FAIL** |
| No unauthorized direct client financial writes | Hardened rules + callables for all money paths | Default UI uses client transactions; vault/bills/edit/reset client-only | **FAIL** |
| Duplicate sale/refund/movement protection | Idempotency on trusted path | Proven on **emulator** for engine; **not** on staging/production | **PARTIAL** |
| Cash-shift accounting verified | Staging E2E + persisted totals | Emulator **30** tests only | **PARTIAL** |
| Firestore/Storage rules safe + workflows work | Staged rules pilot | Production still `firestore.rules` legacy; hardened breaks unmigrated flows | **FAIL** |
| Staging/prod config isolation | Staging project + acceptance | **No staging project** in repo; `verify:staging-deploy-context` exits 1 | **FAIL** |
| Critical prod dependency risks mitigated | Review + fixes | `npm audit` 85 issues (1 critical in tree); functions audit not run | **FAIL** |
| Backup + restore verified | Drill on disposable env | **Not performed** | **FAIL** |

**Conclusion:** Production acceptance **cannot start** until staging exists and gates above are addressed or explicitly risk-accepted in writing by the owner.

---

## 3. Staging acceptance scenarios (required — not run)

| Area | Scenarios | Status |
|------|-----------|--------|
| Sales | Cash, debt, mixed, compliment | **NOT RUN** |
| Cancel / refund / idempotency | Single + duplicate requests | **NOT RUN** (emulator only) |
| Cash shifts | Open, close, deposit, withdraw, concurrent close | **NOT RUN** (emulator only) |
| Customers / debt | Balance, reversal on cancel | **NOT RUN** |
| Inventory | Products, ingredients, stock | **NOT RUN** |
| Open bills / order edits | Full workflow | **NOT RUN** — no trusted server path |
| PlayStation / نخلة | Billing + cancel | **NOT RUN** on staging |
| Roles | Cashier vs admin on callables + rules | **NOT RUN** |
| Recovery | App restart, interrupted request | **NOT RUN** |

---

## 4. Local automated evidence (not a substitute for acceptance)

Executed on developer machine (emulator/local Jest — **not** staging cloud):

| Command | Result (2026-10-26) |
|---------|---------------------|
| `npm run test:functions:unit` | **23/23 pass** |
| `npm run test:functions:emulator` | **30/30 pass** (requires Firestore emulator) |
| `npx jest -c jest.rules.config.js` | **8/8 pass** |
| `npm test` | **76/76 pass** |

These prove **trusted engine behavior in isolation**, not acceptance of the full POS on a deployed environment.

---

## 5. Owner actions before acceptance can begin

1. Create Firebase **staging** project; configure local `.firebaserc` `staging` alias.
2. Deploy Functions + `firebase.staging.json` rules to staging (approved).
3. Create manager + POS Auth users; `bootstrapAdminClaim` + `cashier` claim.
4. Staging build: `REACT_APP_STAGING_BUILD=true`, trusted flags on, hardened `securityMode`.
5. Execute manual acceptance matrix (§3); record Firestore document snapshots / totals.
6. Backup drill on staging export → restore to disposable project.

---

## 6. Acceptance verdict

**ACCEPTANCE BLOCKED** — no staging environment, no cloud acceptance run, multiple release gates **FAIL**.

Do **not** proceed to production deployment or production APK until this report can be updated with staging results and resolved gates.

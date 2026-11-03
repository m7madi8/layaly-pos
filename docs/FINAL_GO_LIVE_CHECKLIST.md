# FINAL GO-LIVE CHECKLIST

**Project:** Layali POS (`cafe-pos`)  
**Date:** 2026-11-03  
**Scope:** Read-only audit + automated tests (no deploy, no production data, no rules change, no new features)  
**Reference:** [FINAL_REQUIREMENTS_COMPLIANCE.md](./FINAL_REQUIREMENTS_COMPLIANCE.md)

---

## Verdict (single decision)

### **READY WITH RESTRICTIONS**

يمكن **بدء التشغيل التجاري** لمسار اليومي الأساسي (شفت → بيع → مصروف/مشتريات → إغلاق) بعد النشر و**اختبار يدوي قصير** موضح أدناه.

**لا** يُعتبر النظام جاهزاً لاستخدام **غير مقيد** لكل الوظائف المالية الجديدة (مرتجعات جزئية، رواتب/سلف، شيكات، أرصدة افتتاحية للتجار) و**لا** لنموذج أمان «موظف = صلاحيات محددة على الخادم» ما دامت قواعد Firestore الإنتاجية legacy كما هي.

---

## 1. Core operations review (code + unit tests)

| Operation | Implementation | Stock / cash / reports | Automated check |
|-----------|----------------|------------------------|-----------------|
| Open shift + carried opening balance | `DailyCashOpenModal`, `cashShiftService.openCashShift`, expected vs actual opening | Cash shift doc + movements | `cashShift.unit.test.js`, `cashShiftMath.test.js` — **pass** |
| Legacy shift without `onDutyStaffIds` | Blocks benefits; `OnDutyAssignmentModal` | Benefits blocked until assigned | `shiftOnDuty.test.js` — **pass** |
| POS sale + payments | Client transaction **or** `completeOrder` if `REACT_APP_TRUSTED_ORDERS=true` | Stock ↓, FIFO/layers on client path; cash movement on paid cash | `orderEngine.unit.test.js`, `orderAccounting.test.js` — **pass** |
| Expenses / purchases | `App.js` + `purchaseService` / expense flows; employee listeners on finance views | Purchases ↑ stock + layers; expenses ↓ cash when cash-paid | `purchasePayment.test.js`, `expenseConfig` tests — **pass** |
| Close shift + close business day | `CashShiftView` + `closeBusinessDay` on shift 2 close | Archives `businessDays` / `businessDaySummaries` stub | Code path reviewed; **no dedicated E2E test** |
| Employee benefits | `executeEmployeeBenefit` — admin-only in service; on-duty enforced | Stock/FIFO or cash; daily quota (not personal) | `employeeBenefitAccounting.test.js` — **pass** |
| Edit invoice | Legacy tx or trusted + `orderEdits` audit fallback | Restore/re-apply stock + `restoreInventoryLayersLifo` on edit | Trusted audit in `orderEngine.unit.test.js`; client guard requires order in memory |
| Delete vs cancel | **Delete:** admin only (`canDeleteOrders`). **Cancel:** `callCancelOrder` or legacy restore | Cancel restores stock paths | Permissions in `adminAuth.js`; delete UI gated |
| Reports / dashboard | Aggregates from loaded `orders` / `expenses` (not fully migrated to summaries-only reads) | Consistent if listeners loaded | `dashboardCashSales.test.js` — **pass** |

**Blocking bugs found in this pass:** none (build was failing on missing `resolveDailyCashGate` — already fixed in tree).

**Residual operational risks (not fixed in this pass — policy/training):**

- Admin **trusted edit** from a view that did not load orders would fail safe on trusted path; legacy path still possible if `REACT_APP_TRUSTED_ORDERS` is false.
- **FIFO** with insufficient layers falls back to `product.cost` — COGS may be approximate until layers backfilled from purchases.

---

## 2. Sensitive financial operations (integration gap)

| Feature | Wired (UI + service) | Idempotency / validation tests | Integration / E2E |
|---------|----------------------|--------------------------------|-------------------|
| Partial returns | `OrderPartialReturnModal`, `orderReturnService` | `orderReturn.test.js` (qty caps only) | **Not run** (no emulator E2E this session) |
| Payroll + advances | `EmployeesView`, `payrollService` | None | **Not run** |
| Checks | `ChecksPanel`, `checkService` | None | **Not run** |
| Supplier opening balance | `SupplierTraderDetailModal` | Ledger utils tested elsewhere | **Not run** |
| FIFO layers | `inventoryLayerService` | None for layers | **Not run** |

**Conclusion:** Safe to **defer use** until one controlled manual run on staging/copy (see §5). Using them on live day-one without that run creates **money/inventory** risk.

---

## 3. Security review

### 3.1 Roles (UI + client services)

| Capability | Admin | Employee |
|------------|-------|----------|
| POS, customers, open bills | Yes | Yes |
| Expenses, purchases, traders | Yes | Yes |
| Record employee benefits | Yes (service enforces) | No (UI + `assertBenefitPermission`) |
| Edit orders | Yes | Yes |
| Delete orders | Yes | No |
| Employees / payroll UI | Yes | Hidden (`!isEmployee`) |
| Vault | Yes (PIN) | No |

Employee login uses **same Firebase Auth UID** as admin after admin has signed in once on the device (`handleEmployeeLogin` → `startRoleSession('employee')`). Role is stored in **localStorage**, not in Firebase Auth claims.

### 3.2 Firestore rules (production)

Current deploy target: [`firestore.rules`](../firestore.rules) — **any authenticated user with `auth.uid == userId` has full read/write on all subcollections.**

- **Effect:** Server does **not** enforce employee vs admin. A user with the café Firebase session could bypass UI via devtools/API.
- **Mitigation in current product model:** dedicated cashier device, strong `REACT_APP_EMPLOYEE_PASSWORD`, admin disconnect device, do not share admin Firebase password.
- **Hardened rules** ([`firestore.rules.hardened`](../firestore.rules.hardened)): tested by `npm run test:rules` (emulator) — **not executed in this session** (requires Java + emulators). **Not** active in production per project docs — enabling without full migration **breaks** client writes.

### 3.3 Cloud Functions / trusted operations

| Flag | When true |
|------|-----------|
| `REACT_APP_TRUSTED_ORDERS=true` | Checkout/cancel via `completeOrder` / `cancelOrder` callables |
| `REACT_APP_TRUSTED_CASH_SHIFTS=true` | Shift open/close/movements via callables |

**Default in `.env.example`:** both **commented off** → legacy **client-side** Firestore transactions (same rules exposure as today).

Functions unit tests (`authz`, `orderEngine`, `idempotency`, `cashShift`) — **28 passed**.

**Idempotency:** order engine + partial return keys; payroll accepts `idempotencyKey` — **not all paths covered by tests**.

### 3.4 Security verdict for go-live

- **Acceptable for restricted go-live** only with: legacy rules unchanged, trusted flags off until functions smoke-tested, physical device discipline.
- **Not acceptable** to claim «employee permissions secured by Firebase» without hardened rules + callables migration ([SECURITY-REMEDIATION-PLAN.md](./SECURITY-REMEDIATION-PLAN.md)).

---

## 4. Stability (executed 2026-11-03)

| Command | Result |
|---------|--------|
| `npm test -- --watchAll=false` | **21 suites, 134 tests — ALL PASSED** |
| `npm run test:functions:unit` | **7 suites, 28 tests — ALL PASSED** |
| `npm run build` | **SUCCESS** (`BUILD_SECONDS ≈ 16.43`; eslint warnings only) |
| `npm run test:rules` | **NOT RUN** (emulator + Java; production rules file is legacy anyway) |

---

## 5. Launch plan

### 5.1 Backup before deploy

| What | How |
|------|-----|
| Firestore data | Firebase Console → Firestore → **Export** (Blaze: scheduled exports) or `gcloud firestore export gs://<bucket>/backup-YYYYMMDD` |
| Auth users | Firebase Console → Authentication → export / document admin email |
| Env secrets | Secure copy of Vercel/host env + `.env.local` (passwords, PIN, API keys) — **not** in git |
| Rules/indexes | Git tag or copy of `firestore.rules`, `firestore.indexes.json`, `firebase.json` at release commit |
| Hosting | Optional: download current `build/` artifact from CI/Vercel |

### 5.2 Restore if something goes wrong

1. **App-only bad deploy:** Redeploy previous Vercel deployment (Rollback).
2. **Bad client build config:** Fix env → rebuild → redeploy (build-time vars).
3. **Data corruption:** Restore Firestore from export to **new** database or point-in-time (Blaze PITR if enabled) — **test restore on staging first**.
4. **Rules mistake:** Republish previous `firestore.rules` from git (`firebase deploy --only firestore:rules`).

**Do not** use in-app «System reset» on production unless intentional — it removes operational data.

### 5.3 Required environment (production build)

See [PRODUCTION.md](./PRODUCTION.md) and `.env.example`.

**Required:**

- All `REACT_APP_FIREBASE_*`
- `REACT_APP_DEMO_MODE=false`
- `REACT_APP_EMPLOYEE_PASSWORD` (non-default; build fails if weak when Firebase configured)
- `REACT_APP_VAULT_PIN` (non-default)
- `REACT_APP_ADMIN_EMAIL` matching Firebase Auth user

**Keep disabled until staged smoke test:**

- `REACT_APP_TRUSTED_ORDERS`
- `REACT_APP_TRUSTED_CASH_SHIFTS`
- `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` (optional hardening)

**Optional:** `REACT_APP_FUNCTIONS_REGION=europe-west1` (must match deployed functions)

### 5.4 Deploy order (when you choose to deploy — not done in this audit)

1. Confirm Firestore **export** completed.
2. Deploy **Cloud Functions** (if enabling trusted flags): `firebase deploy --only functions`
3. Publish **Firestore indexes** if prompted: `firebase deploy --only firestore:indexes`
4. Publish **rules** only if intentionally unchanged legacy: `firebase deploy --only firestore:rules`
5. Set **Vercel/host env** → **Redeploy** SPA (`npm run build` on CI).
6. Firebase Console: **Authorized domains** include production URL.
7. One **admin login** on each device; then employee tab as designed.

### 5.5 Manual tests after deploy (mandatory)

**Day-one (must pass before full traffic):**

1. Admin login → open shift 1 → confirm opening balance / on-duty roster.
2. Sell 2 items (cash + debt) → stock decreased → order in list.
3. Employee login on second session → POS only paths → cannot open Employees screen.
4. Admin: expense (cash) → cash movement; purchase → stock ↑.
5. Close shift 1 → open shift 2 → close shift 2 → business day record appears in archive UI.
6. Legacy open shift without on-duty → modal → assign staff → benefit allowed.

**Before enabling restricted features (do on copy/staging or quiet hour):**

7. Partial return (1 line, restock + cash refund) → verify stock, cash, order line `returnedQty`.
8. Payroll accrual → partial payment → full payment → remaining zero.
9. Register check → collect with open shift → cash movement.
10. Supplier opening balance → trader balance only (no stock change).

**Cancel path:** cancel order → stock restored (spot-check one SKU).

---

## 6. Restrictions for launch (how to apply)

| Restriction | Why | How to enforce practically |
|-------------|-----|----------------------------|
| No partial returns on live until test #7 | No E2E proof | **Process:** do not use «استرجاع جزئي» in Orders until staging test passes |
| No payroll/advances on live until test #8 | No automated tests | **Process:** admin-only screen; delay salary payments until validated |
| No check collect until test #9 | No automated tests | **Process:** do not use Checks tab until validated |
| No supplier opening balance until test #10 | No E2E | **Process:** enter opening balances only after validation |
| Keep `REACT_APP_TRUSTED_*` off | Functions + rules coupling | Leave commented in Vercel; redeploy after explicit functions QA |
| Legacy Firestore rules | No server RBAC | Dedicated devices; strong employee password; no admin password on cashier device |
| FIFO accuracy | Layer gaps use legacy cost | Run purchases before heavy sales; monitor COGS in reports |

There is **no feature flag** in the app to hide partial return / checks without a code change — restrictions are **operational** until tests pass.

---

## 7. What was explicitly out of scope

- Firebase deploy, commit, push
- Production data reads/writes
- Production rules changes
- Emulator E2E for financial flows
- Performance read-count measurement

---

## 8. Closing audit phase

| Document | Status |
|----------|--------|
| [FINAL_REQUIREMENTS_COMPLIANCE.md](./FINAL_REQUIREMENTS_COMPLIANCE.md) | Implementation status (unchanged this pass except cross-reference) |
| **This file** | Go-live decision + launch/runbook |

**Next step after sign-off:** execute §5.1 backup → §5.4 deploy (your action) → §5.5 day-one manual tests → then selectively lift §6 restrictions after tests 7–10.

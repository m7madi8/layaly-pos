# Firebase Spark Security Release — Layali POS

**Date:** 2026-11-14  
**Final verdict:** **BLOCKED_BEFORE_DEPLOYMENT** (rules tests pass locally; production deploy gated on backup + operator auth — see `docs/LAYALI_PRODUCTION_DEPLOYMENT_FINAL_REPORT.md`)

---

## 1. Files modified (this pass)

| File | Change |
|------|--------|
| `firestore.rules` | Tenant membership model (`tenants/`, `userTenants/`, role-scoped `users/{tenantId}`) |
| `src/services/tenantMembershipService.js` | **New** — bootstrap, resolve context, join flow, approve cashier |
| `src/services/tenantMembershipService.test.js` | **New** |
| `src/firebaseClient.js` | `signInWithCashierPassword` |
| `src/config/authSecrets.js` | `REACT_APP_CASHIER_EMAIL` |
| `src/adminAuth.js` | `localStorage` role deprecated (not authoritative) |
| `src/App.js` | `dataUid` + membership login, join UI, settings security panel |
| `scripts/patch-app-datauid.js` | **New** — maps Firestore paths to tenant data root |
| `tests/security/firestore.rules.test.js` | Rewritten for Spark tenant rules |
| `.env.example` | Cashier email documented |
| `docs/FIRESTORE_SPARK_SECURITY_RELEASE.md` | This document |

**Preserved:** local-first stores, pagination, caches, session cleanup on logout.

---

## 2. Authentication architecture

| Account | Method | UID | Role source |
|---------|--------|-----|-------------|
| **Admin** | `REACT_APP_ADMIN_EMAIL` + Firebase password | Unique Auth UID | `tenants/{tenantId}/members/{authUid}.role == admin` |
| **Cashier** | `REACT_APP_CASHIER_EMAIL` + Firebase password | **Different** Auth UID | Same member doc, `role == cashier` |

**Removed as security boundary:** shared session + `localStorage` employee/admin tabs, employee PIN without Functions, custom claims.

**Cashier onboarding (Spark, no Admin SDK):**

1. Create cashier user in **Firebase Console** (Email/Password).
2. Admin sets **invite code** under Settings → أمان الفريق.
3. Cashier signs in → submits **tenant data ID** + invite code → `joinRequests`.
4. Admin approves → writes `members` + `userTenants/{cashierUid}`.

**Legacy production:** First admin login with existing `users/{authUid}` profile auto-creates `tenants/{authUid}`, admin membership, and `userTenants` (no financial data move).

---

## 3. Tenant membership design

| Path | Purpose |
|------|---------|
| `users/{tenantId}/**` | **Unchanged** business data (orders, products, …) |
| `tenants/{tenantId}` | Tenant metadata, `inviteCode` |
| `tenants/{tenantId}/members/{authUid}` | `role`, `active`, timestamps |
| `tenants/{tenantId}/joinRequests/{authUid}` | Pending cashier join |
| `userTenants/{authUid}` | Login index → `tenantId` + `role` (admin writes for cashier; self-bootstrap for legacy admin) |

Members **cannot** update their own membership document. Cashiers **cannot** create admin members.

---

## 4. Security rules summary

- **Legacy unmigrated:** `auth.uid == tenantId` and no `tenants/{tenantId}` doc → full access (compatibility until bootstrap).
- **After bootstrap:** access only via active membership (`admin` | `cashier`).
- **Cashier:** read/write operational collections; **no** vault, payroll accruals, sensitive expense shapes; **no** supplier balance-only patch.
- **Admin:** vault + membership management + audited supplier balance correction.
- **Cross-tenant:** denied.
- **Join requests:** cashier may create own pending request; admin approves.

No blanket `allow read, write` for all authenticated users.

---

## 5. Financial write validation (rules layer)

| Area | Cashier | Admin |
|------|---------|-------|
| Orders, open bills, shifts, movements | Allowed | Allowed |
| Expenses (non-payroll fields) | Allowed | Allowed |
| Vault / vaultMovements | Denied | Allowed |
| payrollAccruals / payrollPayments | Denied | Allowed |
| Supplier `balance` only patch | Denied | Audited correction fields |
| businessDayAdjustments | Denied | Allowed |

**Client-side transactions** unchanged; rules cannot replace server-side invariant checks for complex multi-doc flows. **Blocker:** no Cloud Functions on Spark — high-risk race conditions still rely on client batches + rules field guards, not authoritative server ledger.

---

## 6. Local-first compatibility

- `clearFirestoreClientSessionState()` on logout (existing) clears catalogs, pagination caches, metrics.
- Separate Auth UIDs → switching accounts requires **sign out**; IndexedDB persistence is **per Firebase project**, not per UID — **shared device risk remains** (documented). Always sign out when switching admin/cashier on same browser.

---

## 7. Test results

| Suite | Result |
|-------|--------|
| `npm test -- --watchAll=false` | **PASS** — 44 suites, 206 tests |
| `CI=true npm run build` | **PASS** |
| `npm run test:rules` | **PASS** — 13/13 (2026-11-14, `D:\completed\layali-cafe`) |

**Rules tests locally** (7 cases in `tests/security/firestore.rules.test.js`):

```powershell
firebase setup:emulators:firestore
cd "d:\completed\ليالي كافي"
npm run test:rules
```

---

## 8. Remaining blockers → READY

1. Run **`npm run test:rules`** successfully on a machine with cached Firestore emulator.
2. **Production Firebase Auth:** create cashier user; set `REACT_APP_CASHIER_EMAIL` on Vercel.
3. **Deploy rules before frontend** OR deploy together — first admin login bootstraps tenant; **do not** lock cashiers out before invite flow is configured.
4. **Optional index** for `joinRequests` `status` equality queries (small collection; may work without composite index).

---

## 9. Deployment instructions (manual)

```powershell
# 1. Auth (Console): Email/Password enabled; cashier user created

# 2. Firestore rules + indexes
firebase deploy --only firestore:rules,firestore:indexes --project <PROJECT_ID>

# 3. Env (Vercel)
# REACT_APP_ADMIN_EMAIL, REACT_APP_CASHIER_EMAIL, existing Firebase keys

# 4. Build + deploy frontend
cd "d:\completed\ليالي كافي"
npm ci
$env:CI='true'; npm run build
# vercel --prod

# 5. Smoke
# - Admin login → settings → save invite code → note data ID
# - Cashier login → join request → admin approve → POS works
# - Cashier cannot open vault in UI (and rules deny write)
```

**No financial data migration.** `tenantId` = existing data root UID for legacy cafés.

---

## 10. Rollback

| Action | Rollback |
|--------|----------|
| Rules | Restore `firestore.rules.legacy.backup-20261103` → `firebase deploy --only firestore:rules` |
| Frontend | Previous Vercel deployment |
| Membership docs | Leave in place (harmless under legacy rules) or delete via Console |

---

## Final verdict: **BLOCKED_BEFORE_DEPLOYMENT**

Spark dual-identity auth and membership rules are **implemented in code** and pass **unit/build/rules** gates. Production deploy requires **verified backup**, **Firebase/Vercel operator access**, **cashier Auth user + Vercel env**, then rules + frontend cutover per `scripts/spark-production-deploy.ps1` and `docs/LAYALI_PRODUCTION_DEPLOYMENT_FINAL_REPORT.md`.
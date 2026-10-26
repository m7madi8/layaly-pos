# Staging readiness report — Layali Café POS

**Date:** 2026-10-26  
**Production:** Not deployed, not modified, rules unchanged, trusted flags off.  
**Verdict:** **READY FOR ISOLATED STAGING VALIDATION** — only after a **separate Firebase staging project** is provisioned and configured (blocker below). **Not** ready for final production review.

---

## 1. Git state and files changed (this pass)

**Branch:** `main` (uncommitted work preserved).

**New / updated for staging:**

| File | Purpose |
|------|---------|
| `src/config/validateStagingEnv.js` | Fail build if `REACT_APP_STAGING_BUILD=true` targets production project id |
| `src/index.js` | Calls staging guard at startup |
| `functions/lib/authzPolicy.js` | Testable claim/hardened policy |
| `functions/lib/authz.js` | Uses `authzPolicy` (behavior unchanged) |
| `tests/functions/authz.unit.test.js` | Policy unit tests |
| `.env.example` | Staging + trusted flag documentation |

Prior phases (still uncommitted): `functions/`, `tests/`, `docs/PHASE-*`, trusted UI wiring in `App.js`, etc. — see `git status`.

---

## 2. Staging isolation status

### How Firebase project is selected

| Layer | Mechanism |
|-------|-----------|
| **CLI default** | `.firebaserc` → `"default": "layaly-cafe-13c2b"` (production café project) |
| **React app** | `REACT_APP_FIREBASE_*` in `.env.local` / hosting env → `firebaseClient.js` `projectId` |
| **Emulator tests** | `layali-rules-test` + `FIRESTORE_EMULATOR_HOST` (no cloud) |
| **Functions deploy** | `firebase deploy` uses active CLI project (`firebase use`) |

### Blocker: no staging project in repository

- `.firebaserc` defines **only** `layaly-cafe-13c2b`.
- There is **no** `staging` alias, no second project id in repo, and **no cloud resources were created** in this pass (per safety rules).

### Required isolation (operator steps — not executed here)

1. Create a **new** Firebase project (e.g. `layali-cafe-staging`) in Console — **requires explicit authorization**.
2. Add to `.firebaserc` locally (do not commit secrets):

   ```json
   "projects": { "default": "layaly-cafe-13c2b", "staging": "<staging-project-id>" }
   ```

3. Staging hosting env:

   ```env
   REACT_APP_STAGING_BUILD=true
   REACT_APP_FIREBASE_PROJECT_ID=<staging-project-id>
   REACT_APP_DEMO_MODE=false
   # staging-only after functions deploy:
   # REACT_APP_TRUSTED_ORDERS=true
   # REACT_APP_TRUSTED_CASH_SHIFTS=true
   # REACT_APP_FUNCTIONS_REGION=europe-west1
   ```

4. Deploy Functions **only** to staging: `firebase use staging` then `firebase deploy --only functions` (when approved).
5. Firestore on staging: deploy `firestore.rules.hardened` + `firestore.indexes.json` **to staging project only**; set `users/{uid}.securityMode: 'hardened'` on test tenant after pilot.
6. Storage: separate bucket from `REACT_APP_FIREBASE_STORAGE_BUCKET` on staging env.
7. **Verification:** With `REACT_APP_STAGING_BUILD=true`, build must **fail** if `REACT_APP_FIREBASE_PROJECT_ID` is `layaly-cafe-13c2b` (`validateStagingEnv.js`).

### Accidental production use

| Risk | Mitigation |
|------|------------|
| Wrong env on Vercel preview | Separate staging project id + `REACT_APP_STAGING_BUILD=true` |
| CLI `firebase use default` + deploy | Document `firebase use staging`; never deploy rules to prod until sign-off |
| Trusted flags on prod build | Not set in production env; staging guard blocks prod project id when staging build flag on |

---

## 3. Test commands and results (executed 2026-10-26)

**Prerequisite for emulator suites:** Java 21+, Firestore emulator running (`docs/EMULATOR-TEST-SETUP.md`, `subst L:` for Arabic path).

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | **20/20 pass** (includes `authzPolicy`) |
| `npm run test:functions:emulator` | **30/30 pass** (orders, shifts, concurrency) |
| `npx jest -c jest.rules.config.js --runInBand` | **8/8 pass** |
| `npm test -- --watchAll=false` | **75/75 pass** |
| `npm run build` | **Success** |

If emulator is down, `test:functions:emulator` **fails** on environment gate (not a silent pass).

---

## 4. Remaining direct client writes (default app)

| Domain | Entry | Callable | Staging blocker? |
|--------|-------|----------|------------------|
| Orders checkout/cancel | `App.js` | `completeOrder` / `cancelOrder` if `TRUSTED_ORDERS` | Yes until flag + deploy |
| Cash shifts | `App.js` / `cashShiftService.js` | `open/close/recordCashShiftMovement` if `TRUSTED_CASH_SHIFTS` | Yes |
| Vault | `vaultService.js`, `App.js` | `verifyVaultPin` only; **no** vault mutation callable | **Yes** |
| Open bills | `openBillsService.js` | None | **Yes** |
| Order edit + `orderEdits` | `App.js` | Partial trusted edit (no audit doc) | **Yes** |
| Catalog / ingredients | `App.js`, views | None | Partial (hardened allows cashier catalog) |
| Reset ledgers | `resetSalesAndLedgers.js` | `resetSalesAndCustomerLedgers` (admin claim; UI not wired) | **Yes** |
| PlayStation | `playstationService.js` | Billed via trusted order engine only | Partial |
| نخلة external | `hookahExternalSale.js` + order engine | Pricing in `completeOrder` | Covered when trusted orders on |

---

## 5. Authorization findings

### Sensitive callables (`functions/index.js`)

| Callable | Auth |
|----------|------|
| `bootstrapAdminClaim` | Authed user; sets `admin` claim once |
| `verifyEmployeePin` | Authed; compares `EMPLOYEE_PIN` env — **does not** issue role claim |
| `verifyVaultPin` | `requireAdminClaim` |
| `resetSalesAndCustomerLedgers` | `requireAdminClaim` |
| `completeOrder`, `cancelOrder`, cash shift ops | `requireOrderCaller` |

### Policy (`authzPolicy.js` + `requireOrderCaller`)

- **Hardened** + no `admin`/`cashier` JWT claim → **denied**.
- **Legacy** `securityMode` → any authenticated uid may call (bridge for migration).

### Client gaps (unchanged behavior)

- **Employee “role”** = `localStorage` + UI (`adminAuth.js`) — **not** server enforcement for Firestore in legacy mode.
- **Optional** `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` checks PIN on server but **does not** bind cashier claim to session.
- **Admin** = Firebase email/password; separate from employee PIN screen.

### Staging authorization checklist (manual)

1. Create **manager** Auth user on staging → run `bootstrapAdminClaim` once → re-login.
2. Create **POS** Auth user with `cashier` claim (Console or Admin SDK) — **recommended Option A** (dual users) per `SECURITY-REMEDIATION-PLAN.md`.
3. Set `securityMode: 'hardened'` on staging `users/{uid}` only after callables verified.
4. Do **not** rely on employee PIN alone for callable authorization.

**Account migration:** Documented in remediation plan; **no** automatic account/claim changes in this pass.

---

## 6. Financial consistency and concurrency

**Formula (unchanged):**  
`expected = opening + sales + deposits − withdrawals − refunds`

**Emulator evidence (persisted state checked):**

- Cash / debt / mixed / compliment / price tampering / idempotency / cancel / shift open-close / deposits / closed-shift rejection.
- **Concurrency:** `concurrency.emulator.test.js` — parallel sale+close (`allSettled`), parallel duplicate idempotency → single order/movement.

**Gaps:**

- No cloud staging integration test run (project not provisioned).
- PlayStation / نخلة end-to-end on emulator not in shift suite (order engine unit/hookah tests only).
- Callable **unauthorized** role tests need Auth emulator + custom tokens (future).

---

## 7. Dependency audit summary

`npm audit` (root): **89 vulnerabilities** (5 critical, 41 high, 33 moderate, 10 low).

- Many are **transitive** (CRA, Jest/jsdom, Babel, `@grpc/grpc-js` via Firebase tooling).
- **`npm audit fix --force`** may upgrade Jest to 30 — **not run** (breaking change risk).
- **Production runtime** is mostly browser bundle + Firebase SDK; prioritize Firebase/grpc advisories affecting **Functions** runtime in staging deploy review.

---

## 8. Backup and restore

| Item | Status |
|------|--------|
| Documented | `docs/PRODUCTION.md` — Console export / scheduled exports (Blaze) |
| Automated in app | None |
| Isolated restore drill | **Not performed** (no disposable staging project in this pass) |

**Staging prerequisite:** Enable scheduled Firestore export on **staging** project; practice restore into a **third** disposable project before production cutover.

---

## 9. Staging deployment prerequisites (ordered)

1. **Provision** dedicated Firebase staging project (authorized).
2. Configure staging env vars; `REACT_APP_STAGING_BUILD=true`.
3. `cd functions && npm install`; set `EMPLOYEE_PIN`, `VAULT_PIN` in **Functions** config (not React).
4. `firebase use staging` → deploy **functions only** to `europe-west1`.
5. Smoke-test callables from staging build with trusted flags **on**.
6. Migrate test data; open shift → cash sale → close → vault transfer on close.
7. Deploy hardened rules + indexes to **staging**; set `securityMode: 'hardened'` on test uid.
8. Full regression; then consider production (separate approval).

---

## 10. Explicit production blockers

1. Default client-trusted financial writes in production config.
2. No demonstrated staging isolation in repo (single `.firebaserc` project).
3. Vault, open bills, reset UI, order edit audit not on trusted callables.
4. Employee session not bound to JWT `cashier` claim by default.
5. Production `firestore.rules` still full owner write.
6. Backup/restore not drill-tested.
7. No production monitoring/alerting in codebase.
8. Dependency audit not remediated.

---

## 11. Final verdict

| Level | Status |
|-------|--------|
| **Production** | **BLOCKED** |
| **Isolated staging validation** | **READY** once staging Firebase project exists and steps in §9 are executed (no production touch) |
| **Final production review** | **BLOCKED** until staging hardened pilot + remaining financial paths resolved or risk-accepted in writing |

Passing unit/emulator/rules/app tests and build **does not** imply all financial or authorization paths are secure — only that the **trusted engine and policies tested** behave as specified under the emulator.

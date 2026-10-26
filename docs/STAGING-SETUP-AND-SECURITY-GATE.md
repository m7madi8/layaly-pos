# Staging setup and security gate — Layali Café POS

**Date:** 2026-10-26  
**Cloud changes:** None (no deploy, no new Firebase projects).  
**Verdict:** **READY TO CONFIGURE STAGING** — templates and local guards are in place. **READY FOR ISOLATED STAGING VALIDATION** only after the user creates a staging project and completes manual steps below. **Production: BLOCKED.**

---

## 1. Files changed (this pass)

| Path | Purpose |
|------|---------|
| `.firebaserc.example` | Staging alias placeholder (`REPLACE_WITH_YOUR_STAGING_PROJECT_ID`) |
| `.env.staging.example` | Staging SPA env template + `REACT_APP_STAGING_BUILD=true` |
| `firebase.staging.json` | Staging deploy manifest: **hardened** Firestore rules + indexes (not production `firestore.rules`) |
| `scripts/knownProductionProject.js` | Shared production project id constant |
| `scripts/check-staging-deploy-context.js` | CLI guard — refuses production active project |
| `src/config/knownProductionProject.js` | SPA staging guard constant |
| `src/config/validateStagingEnv.js` | `isProductionFirebaseProjectId()` export |
| `src/config/validateStagingEnv.test.js` | Unit test for project id guard |
| `functions/lib/callableActor.js` | Actor from JWT only; detect smuggled `role`/`actor` in body |
| `functions/index.js` | Reject client role fields; `isAdmin` from JWT claim only |
| `tests/functions/callableActor.unit.test.js` | Forged-role payload tests |
| `package.json` | `verify:staging-deploy-context` script |

See also: `docs/STAGING-READINESS-REPORT.md`, `docs/PHASE-5-REPORT.md`.

---

## 2. Staging configuration design

### Current production wiring (unchanged)

| Component | Selection |
|-----------|-----------|
| `.firebaserc` | `"default": "layaly-cafe-13c2b"` |
| `firebase.json` | `firestore.rules` (legacy), `storage.rules`, `functions/`, emulators |
| React app | `REACT_APP_FIREBASE_*` → `src/firebaseClient.js` |
| Functions region | `europe-west1` (`functions/index.js`, `REACT_APP_FUNCTIONS_REGION`) |

### Intended staging wiring (after user creates project)

| Component | Staging choice |
|-----------|----------------|
| `.firebaserc` (local) | Add `"staging": "<user-staging-project-id>"` — copy from `.firebaserc.example` |
| SPA env | `.env.staging.example` → `.env.staging.local` (not committed) |
| Firestore rules deploy | Use `firebase.staging.json` so **hardened** rules deploy to staging only |
| Storage | Staging bucket in `REACT_APP_FIREBASE_STORAGE_BUCKET` |
| Functions secrets | `EMPLOYEE_PIN`, `VAULT_PIN` in **Functions** env on staging project only |

### Guards (verified locally)

| Guard | Behavior |
|-------|----------|
| `REACT_APP_STAGING_BUILD=true` + prod project id | **Build/runtime throw** (`validateStagingEnv.js`) |
| `npm run verify:staging-deploy-context` | **Exit 1** if no staging alias or active CLI project is production (tested: fails until user adds staging to `.firebaserc`) |
| Trusted flags + prod project id | Blocked when staging build flag on |

### Manual steps after creating a staging Firebase project

1. Firebase Console: create project (name/id chosen by operator — **not** invented in this repo).
2. Enable Auth (Email/Password), Firestore, Storage, Functions (Blaze if needed).
3. Copy web app config into `.env.staging.local` from `.env.staging.example`.
4. Set `REACT_APP_STAGING_BUILD=true` and staging `REACT_APP_FIREBASE_PROJECT_ID`.
5. Locally merge `.firebaserc.example` into `.firebaserc` with real staging id (do not commit if policy forbids).
6. `firebase login` → `firebase use staging` → `npm run verify:staging-deploy-context` must print OK.
7. **When explicitly approved:** `cd functions && npm install` → deploy functions to staging only:

   ```bash
   firebase deploy --only functions --config firebase.staging.json --project <staging-project-id>
   ```

8. **When explicitly approved:** deploy Firestore to staging:

   ```bash
   firebase deploy --only firestore --config firebase.staging.json --project <staging-project-id>
   ```

9. Create test Auth users; run `bootstrapAdminClaim` once for manager; assign `cashier` claim to POS user (see §4).
10. Set `users/{uid}.securityMode` to `hardened` on staging tenant after callables work.
11. Enable `REACT_APP_TRUSTED_ORDERS` / `REACT_APP_TRUSTED_CASH_SHIFTS` on **staging hosting only**.

### Safe commands (local / no cloud)

| Command | When |
|---------|------|
| `npm run test:functions:unit` | Anytime |
| `npm run test:functions:emulator` | Firestore emulator + `FIRESTORE_EMULATOR_HOST` |
| `npx jest -c jest.rules.config.js` | Emulator running |
| `npm test` / `npm run build` | Anytime |
| `npm run verify:staging-deploy-context` | After `firebase use staging` and staging alias configured |

### Unsafe without approval

- `firebase deploy` with `default` / production project
- Any change to production rules, data, or claims
- Enabling trusted flags on production hosting env

---

## 3. Employee authorization

### Current flow (production behavior unchanged)

1. **Manager:** Firebase `signInWithEmailAndPassword` → `localStorage` role `admin` (UI).
2. **Employee:** Same Firebase session on device; PIN checked in **client** (`getEmployeeLoginPassword`) or optionally `verifyEmployeePin` callable — **does not** change JWT.
3. **Vault UI:** Client PIN + `localStorage` admin role for navigation.
4. **Callables:** `requireOrderCaller` uses JWT `role` claim when `securityMode: 'hardened'`; **legacy bridge** allows any authed uid when not hardened.

### Why PIN verification ≠ trusted employee identity

- `verifyEmployeePin` only returns `{ ok: true }` — **no** custom token, **no** `cashier` claim, **no** binding to subsequent callables.
- Employee “role” in UI comes from `localStorage`, which any script on the device can set.
- `completeOrder` **admin-only** actions (compliment, custom price) use `isAdminTokenRole(JWT)` — forging `localStorage` does **not** grant compliment on hardened path; forging JWT without Firebase would fail Auth.
- Under **legacy** rules, the same Firebase uid can still write Firestore directly regardless of PIN.

### Approach comparison

| Option | Description | Fits current app | Staging recommendation |
|--------|-------------|------------------|------------------------|
| **A — Dual Firebase users** | `manager@` (admin claim) + `pos@` (cashier claim) on POS tablet | Yes — avoids one JWT for two roles | **Recommended first** |
| **B — Custom token after PIN** | Callable verifies PIN → Admin SDK `createCustomToken(uid, { role: 'cashier' })` | Conflicts if same uid is manager | Use only with dedicated POS uid |
| **C — Per-employee Auth accounts** | Full account per staff | Highest ops cost | Long-term |

### Recommended migration (staging)

1. Create **two** Auth users on staging (manager + POS).
2. Manager signs in once → call `bootstrapAdminClaim` → refresh token.
3. Set POS user `cashier` claim via Admin SDK / Console.
4. POS device stays signed in as POS user; manager uses manager login on back office.
5. Set `securityMode: 'hardened'` on staging.
6. Enable trusted order/shift flags on staging build.

### Rollback

- Set `securityMode: 'legacy'` on user doc.
- Disable trusted flags on hosting.
- Revert to single shared Firebase session + client PIN (current production pattern).

### Safe local changes (this pass)

- Callables **reject** `role`, `actor`, `employeeId` in request body (`invalid-argument`).
- `actor` for audit fields built from **JWT only** (`callableActor.js`).
- `isAdmin` for pricing privileges uses **JWT `admin` claim only** — not `requireOrderCaller` legacy role string.
- Unit tests: `authzPolicy`, `callableActor`.

### What is **not** fixed

- Production login UX unchanged.
- No automatic claim issuance after employee PIN.
- Sensitive operations are **not** fully trusted until hardened mode + JWT claims + trusted callables are active on staging.

---

## 4. Dependency audit

### Commands run

- `npm audit` (full tree)
- `npm audit --omit=dev` (production dependency tree)
- `npm audit fix` (**without** `--force`)

### Results (after `npm audit fix`)

| Scope | Before (Phase 5) | After (this pass) |
|-------|------------------|-------------------|
| Full tree | 89 (5 critical, 41 high) | **85** (1 critical, 31 high, 44 moderate, 9 low) |
| `--omit=dev` | 73 (4 critical) | **Reduced** (re-run `npm audit --omit=dev` before release) |

### Interpretation

- **Many findings** are in **dev** tooling (CRA, Jest, jsdom, eslint, firebase-tools) — not shipped in the browser bundle.
- **Runtime SPA:** `firebase`, `react`, `jspdf`, etc. — review high issues in `firebase` / `undici` transitive chain; not all are remotely exploitable in a static POS UI.
- **Functions runtime:** separate `functions/package.json` — run `cd functions && npm audit` before staging deploy (not run in this pass).
- **Not applied:** `npm audit fix --force` (would bump Jest major).

### Compatible fixes applied

- `npm audit fix` updated lockfile within semver ranges. **Re-run:** unit, app tests, build — all passed (see §5).

---

## 5. Tests executed (this session)

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | **23/23 pass** |
| `npm run test:functions:emulator` | **30/30 pass** (emulator required) |
| `npx jest -c jest.rules.config.js` | **8/8 pass** |
| `npm test -- --watchAll=false` | **76/76 pass** |
| `npm run build` | **Success** |
| `npm run verify:staging-deploy-context` | **Exit 1** (expected — staging alias not configured) |

---

## 6. Remaining blockers

1. No staging Firebase project configured in repo (user must create).
2. Functions not deployed anywhere (by design).
3. Vault, open bills, order edit audit, reset UI — client-trusted.
4. Employee identity not claim-bound after PIN alone.
5. Production `firestore.rules` unchanged.
6. Backup/restore drill not performed.
7. `functions/` dependency audit not run.
8. Residual npm audit highs/critical in toolchain.

---

## 7. Next action requiring user approval

**Create a dedicated Firebase staging project** and add its id to **local** `.firebaserc` as `staging`, then:

1. `firebase use staging`
2. `npm run verify:staging-deploy-context` → must succeed
3. Approve **staging-only** Functions + Firestore deploy using `firebase.staging.json`
4. Run staging QA checklist in `STAGING-READINESS-REPORT.md`

Do **not** deploy to `layaly-cafe-13c2b` or enable trusted flags on production hosting.

---

## 8. Verdict summary

| Level | Status |
|-------|--------|
| **READY TO CONFIGURE STAGING** | **Yes** — templates, guards, docs, tests |
| **READY FOR ISOLATED STAGING VALIDATION** | **No** — awaiting staging project + approved deploy |
| **BLOCKED** (production / final review) | **Yes** |

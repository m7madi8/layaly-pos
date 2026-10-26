# Production deployment report — Layali Café POS

**Date:** 2026-10-26  
**Target project (documented default):** `layaly-cafe-13c2b` (from `.firebaserc` — **not modified by this pass**)  
**Deployment performed:** **No**  
**Final verdict:** **`PRODUCTION RELEASE BLOCKED`**

---

## 1. Why deployment did not proceed

Task F requires all release gates to pass before irreversible production steps. Per:

- `docs/STAGING-READINESS-REPORT.md`
- `docs/STAGING-SETUP-AND-SECURITY-GATE.md`
- `docs/PHASE-5-REPORT.md`
- `docs/SECURITY-REMEDIATION-PLAN.md`
- `docs/PRODUCTION-ACCEPTANCE-REPORT.md`

**Critical blockers remain unresolved.** Deploying Functions, swapping Firestore rules, or enabling trusted flags on production would either:

- Leave financial data **client-trusted** (no security gain), or
- **Break** daily operations (hardened rules without full callable migration for vault, open bills, edits).

Therefore **no** `firebase deploy`, **no** production rules change, **no** claim migration, **no** trusted-flag activation, and **no** production frontend deploy was executed.

---

## 2. Production configuration (prepared in repo — not applied to cloud)

| Component | Repository state | Production cloud state |
|-----------|------------------|------------------------|
| Auth | Email/password; `REACT_APP_ADMIN_EMAIL` | **Unchanged** |
| Functions | `functions/` callables scaffolded | **Not deployed** |
| Firestore rules | `firestore.rules` (legacy owner R/W) | **Unchanged** |
| Hardened rules | `firestore.rules.hardened` | **Not active** |
| Indexes | `firestore.indexes.json` | **Not deployed** |
| Storage | `storage.rules` | **Unchanged** |
| SPA secrets | `.env.example` / build guards | Owner must set in hosting; **not logged here** |
| Trusted orders | `REACT_APP_TRUSTED_ORDERS` | **Off** (must stay off until staged) |
| Trusted cash shifts | `REACT_APP_TRUSTED_CASH_SHIFTS` | **Off** |
| Admin/cashier | Claims via `bootstrapAdminClaim` + manual cashier | **Not configured in this pass** |

**Project ID validation:** Production id is `layaly-cafe-13c2b`. Staging guard (`REACT_APP_STAGING_BUILD=true`) rejects that id for staging builds. No production deploy command was run.

---

## 3. Planned deployment sequence (for owner, after gates pass)

**Only execute with explicit approval and completed acceptance report.**

1. **Backup** — Firestore export + document current rules/functions revision.
2. **Functions** — `cd functions && npm install`; set `EMPLOYEE_PIN`, `VAULT_PIN` in Functions secrets (not in React bundle).
3. `firebase use` → confirm active project is `layaly-cafe-13c2b` intentionally.
4. `firebase deploy --only functions` (region `europe-west1`).
5. Smoke-test callables on production project with **trusted flags off** first (legacy client still works).
6. Migrate remaining client paths OR accept risk document.
7. Set `securityMode: 'hardened'` per tenant when ready; deploy `firestore.rules.hardened` via reviewed cutover.
8. Enable `REACT_APP_TRUSTED_ORDERS` + `REACT_APP_TRUSTED_CASH_SHIFTS` on production hosting **only** after step 7.
9. Deploy hosting (e.g. Vercel) with production env vars.
10. Post-deploy smoke: one cash sale, shift movement, cancel — verify Firestore documents.

---

## 4. Rollback (documented — not executed)

| Layer | Rollback |
|-------|----------|
| Hosting | Redeploy previous build / revert env flags |
| Functions | Redeploy prior revision from Firebase Console or git tag |
| Rules | Redeploy previous `firestore.rules` from git |
| Trusted flags | Set `REACT_APP_TRUSTED_*` to false; rebuild |
| Data | Restore from pre-deploy export (never use in-app reset on live data) |

---

## 5. Backup and recovery

| Item | Status |
|------|--------|
| Pre-deploy backup taken | **No** — deployment not started |
| Restore tested | **No** |
| Rollback tested | **No** |

---

## 6. Monitoring post-deploy

Not applicable — no deployment.

---

## 7. Minimum action required from owner

To unblock production deployment:

1. Complete **staging acceptance** (`docs/PRODUCTION-ACCEPTANCE-REPORT.md` updated with pass results).
2. Resolve or **written risk-accept** for: employee claims, vault/open-bills callables, backup drill.
3. Provide **Firebase CLI login** and written **go** for production deploy window.
4. Confirm hosting env vars and Functions secrets (never commit or paste in chat).

---

## 8. Final verdict

**`PRODUCTION RELEASE BLOCKED`**

No production Firebase resources were modified. No credentials were used or exposed.

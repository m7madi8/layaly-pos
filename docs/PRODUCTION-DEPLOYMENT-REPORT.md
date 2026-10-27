# Production deployment report — Layali Café POS

**Date:** 2026-10-26  
**Firebase project:** `layaly-cafe-13c2b` (unchanged; CLI `firebase use` confirmed)  
**Deployment performed:** **Web (Vercel) yes** — Firebase backend/rules/functions **no**  
**Final verdict:** **`WEB DEPLOYED — APK BLOCKED`**

---

## 1. What was deployed

| Layer | Action | Result |
|-------|--------|--------|
| **Production web (CRA)** | `vercel link --project layaly-pos` + `vercel --prod --yes` | **Success** — aliased to `https://layaly-pos.vercel.app` |
| **Cloud Functions** | Not deployed | Unchanged on project (list API failed; repo `functions` not published) |
| **Firestore rules** | Not deployed | Production remains legacy `firestore.rules` in cloud |
| **Hardened rules** | Not deployed | `firestore.rules.hardened` not activated |
| **Firestore indexes** | Not deployed | `firestore.indexes.json` is empty |
| **Trusted flags** | Not changed | Vercel production env not modified in this pass; app behavior stays **client-trusted** Firestore paths |
| **Storage rules** | Not deployed | Unchanged |

**Vercel production deployment**

| Field | Value |
|-------|--------|
| Project | `m7madi8s-projects/layaly-pos` |
| Deployment id | `dpl_BA5mj3E56CTr9ChXezK8qbJ9SnV4` |
| Deployment URL | `https://layaly-n7xtr58t1-m7madi8s-projects.vercel.app` |
| Production alias | **`https://layaly-pos.vercel.app`** |
| Build | CRA `npm run build` on Vercel — **Compiled successfully** |
| Inspect | `https://vercel.com/m7madi8s-projects/layaly-pos/BA5mj3E56CTr9ChXezK8qbJ9SnV4` |

**Live check:** HTTP fetch of `https://layaly-pos.vercel.app` returned page title **ليالي كافيه** (2026-10-26).

---

## 2. Release scope (owner-authorized, narrow)

Per explicit production request and release-gate policy:

- Deployed **frontend only**, backward-compatible with existing production Firebase (same project id via Vercel build-time env).
- Did **not** enable `REACT_APP_TRUSTED_ORDERS` / `REACT_APP_TRUSTED_CASH_SHIFTS`.
- Did **not** swap Firestore rules to hardened mode.
- Did **not** run destructive resets or data migrations.

This matches “update the live POS UI/logic” without forcing an unverified server migration.

---

## 3. Tests executed (this pass)

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | **23/23 pass** |
| `npm test -- --watchAll=false` | **76/76 pass** |
| `npm run test:functions:emulator` | **Not run** (time; not required for frontend-only deploy) |
| `npm run test:rules` | **Not run** |
| Staging / cloud acceptance | **Not run** |

---

## 4. Backup and recovery

| Item | Status |
|------|--------|
| Pre-deploy Firestore export | **Not performed** — no evidence of backup in this pass |
| Restore drill | **Not performed** |
| Rollback (web) | Redeploy previous Vercel deployment from Console or `vercel rollback` |

**Owner action:** Run a Firestore export from Firebase Console (or scheduled export on Blaze) before any future rules/functions cutover.

---

## 5. Remaining known risks (production)

Still applicable after this frontend deploy (see `docs/PRODUCTION-ACCEPTANCE-REPORT.md`, `docs/SECURITY-REMEDIATION-PLAN.md`):

- Financial writes remain **client-side** on default paths (orders, shifts, vault, open bills, edits).
- Employee “role” can still be **localStorage**-driven; JWT `cashier` / `admin` claims not required for all flows.
- Trusted callables exist in repo but are **not** deployed and **not** wired via hosting flags.
- `npm audit` on root: **85** vulnerabilities reported on Vercel build log (unchanged class of issue).
- No cloud acceptance matrix was executed on this deployment.

---

## 6. Local repository changes related to release

- Linked Vercel project (`.vercel/` — gitignored).
- `mobile/app.config.js`: **version `1.0.1`**, **Android `versionCode` 2** (for APK update continuity).
- All prior tracked/untracked work preserved; no git commit created in this pass.

---

## 7. Final verdict

**`WEB DEPLOYED — APK BLOCKED`**

Production web is live at **`https://layaly-pos.vercel.app`** on Firebase **`layaly-cafe-13c2b`**. Android APK **1.0.1 (versionCode 2)** build is **queued on EAS** — see `docs/APK-BUILD-REPORT.md`. No local APK file is available yet.

# Staging connection status — Layali Café POS

**Date:** 2026-10-26 (updated after CLI reauth)  
**Production touched:** No deploy, no rule/data/claim changes.  
**Verdict:** **`STAGING PROJECT NOT FOUND — USER ACTION REQUIRED`**

---

## 1. Firebase CLI authentication

| Check | Result |
|-------|--------|
| `firebase login --reauth` | **Success** (owner completed browser login) |
| `firebase use` | Active CLI project: **`layaly-cafe-13c2b`** (production) |
| `firebase projects:list` | **Success** after `NODE_OPTIONS=--use-system-ca` (see §1.1) |

Being logged in does **not** mean staging is configured.

### 1.1 SSL / `projects:list` on Windows

If `firebase projects:list` fails with `unable to verify the first certificate`, run once per shell session:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
firebase projects:list
```

---

## 2. Does a separate staging project exist?

### 2.1 Google account project inventory (IDs only)

| Display name | Project ID | Notes |
|--------------|------------|--------|
| layaly cafe | **`layaly-cafe-13c2b`** | **Production** for this repo (current CLI default) |
| 99cafe | `cafe-41054` | Separate project; **not** wired in this repository |
| banzeen | `banzeen-97eae` | Unrelated |
| farah-store | `farah-store-48a43` | Unrelated |
| healthy-mama | `healthy-mama-67981` | Unrelated |
| m7mad | `m7mad-82b1a` | Unrelated |
| mido-wos | `mido-wos` | Unrelated |
| mohammad-os | `mohammad-os` | Unrelated |
| mywebsite | `mywebsite-25df5` | Unrelated |

**9 projects total.** There is **no** project id in this list that is already configured as Layali Café **staging** (no `staging` alias, no `.env.staging.local`).

Using another existing project (e.g. `cafe-41054`) is only valid if the owner **explicitly** confirms it is empty and dedicated to Layali staging—not production for another business.

### 2.2 Repository wiring

| Source | Finding |
|--------|---------|
| **`.firebaserc`** | Only **`default`** → `layaly-cafe-13c2b`. **No `staging` alias.** |
| **`.env.staging.local`** | **Missing** |
| **`.env.local` (SPA)** | Targets **`layaly-cafe-13c2b`** (production). `REACT_APP_STAGING_BUILD` not set for staging file. |
| **`npm run verify:staging-deploy-context`** | **Exit 1** — staging alias missing (expected) |

**Conclusion:** **No isolated staging environment is configured.** Recommended path: **create a new Firebase project** (e.g. `layali-cafe-staging` if the id is available) **or** designate an unused project after owner confirmation—then complete §5B.

---

## 3. Verified project IDs (no secrets)

| Role | Project ID | Where referenced |
|------|------------|------------------|
| **Production** | `layaly-cafe-13c2b` | `.firebaserc` default, `.env.local`, known-production guards |
| **Staging** | *None* | `.env.staging.example` only |
| **Emulator / rules tests** | `layali-rules-test` | Local tests only |

---

## 4. Exact next steps (no deployment)

### A. Choose or create staging project

**Recommended:** Firebase Console → **Add project** → new id (e.g. `layali-cafe-staging`). Enable Auth (Email/Password), Firestore, Storage; register a **web app** for staging config. **Do not** copy real café production data.

**Alternative:** If `cafe-41054` (or another id) is intentionally empty and only for Layali staging, confirm in writing before wiring—otherwise treat as unrelated.

### B. Local wiring (after `<STAGING_ID>` is chosen)

1. Add to **local** `.firebaserc`: `"staging": "<STAGING_ID>"` (keep `default` as `layaly-cafe-13c2b`).
2. `firebase use staging`
3. Copy `.env.staging.example` → `.env.staging.local`; set `REACT_APP_FIREBASE_PROJECT_ID=<STAGING_ID>` and remaining web config from Console.
4. `npm run verify:staging-deploy-context` → must exit **0**.
5. Continue with `docs/STAGING-SETUP-AND-SECURITY-GATE.md` (staging-only deploy when explicitly approved).

**Verdict after B (before cloud deploy):** **`STAGING PROJECT EXISTS — LOCAL CONFIGURATION REQUIRED`** until steps 1–4 pass.  
**After staging deploy + smoke checks:** **`STAGING CONFIGURED — READY FOR VALIDATION`**.

### C. Do not do yet

- `firebase deploy` to `layaly-cafe-13c2b`
- `firebase use` production for staging work
- Enable `REACT_APP_TRUSTED_*` on production hosting

---

## 5. Remaining blockers

1. No dedicated Layali staging project id chosen or wired locally.
2. Local SPA dev (`.env.local`) still points at production Firebase.
3. Staging Functions / hardened rules not deployed (by policy).
4. Production release and APK still gated on staging acceptance (see `PRODUCTION-DEPLOYMENT-REPORT.md`, `APK-BUILD-REPORT.md`).

---

## 6. Verdict

**`STAGING PROJECT NOT FOUND — USER ACTION REQUIRED`**

Create a new staging Firebase project (recommended) or explicitly approve an unused existing project id, then complete §4B. **Stop before any deployment** until local wiring passes `verify:staging-deploy-context`.

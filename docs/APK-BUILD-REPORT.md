# APK build report — Layali Café POS

**Date:** 2026-10-26  
**Android package:** `com.layali.cafepos`  
**Web URL loaded by shell:** `https://layaly-pos.vercel.app` (`EXPO_PUBLIC_APP_URL` in `mobile/eas.json` preview profile)  
**APK produced locally:** **No**  
**Final verdict:** **`WEB DEPLOYED — APK BLOCKED`** (EAS cloud build not finished; prior artifact expired)

---

## 1. Application identity (this release)

| Field | Value |
|-------|--------|
| Application ID | `com.layali.cafepos` |
| Expo slug | `layali-cafe-pos` |
| EAS project id | `5428fba1-40bf-42e2-95e4-284215c6742d` |
| Owner | `m7madi8` |
| Version name | **1.0.1** (`mobile/app.config.js`) |
| Version code | **2** |
| Signing | **Expo remote keystore** — `Build Credentials Pu1TeglP9F (default)` (same identity as prior preview build) |

---

## 2. Build attempts (2026-10-26)

### Active build (use this when complete)

| Field | Value |
|-------|--------|
| Build id | **`50971c4c-2488-43a3-9e04-a04d6c084384`** |
| Profile | `preview` (APK, internal) |
| Status (last check) | **`IN_QUEUE`** on EAS (not started after extended wait) |
| Logs / status page | https://expo.dev/accounts/m7madi8/projects/layali-cafe-pos/builds/50971c4c-2488-43a3-9e04-a04d6c084384 |

### Canceled build (stuck in queue)

| Build id | Notes |
|----------|--------|
| `2b767c81-94fc-4201-b159-d2d18e51687b` | Canceled after prolonged `IN_QUEUE` |

### Previous successful build (not this release)

| Build id | Version | Artifact |
|----------|---------|----------|
| `2c33f120-7108-4405-9e11-04269f19b957` | 1.0.0 / versionCode 1 | **Expired** — `eas build:download` and direct URL return **404** |

---

## 3. What was tried

| Action | Result |
|--------|--------|
| `eas build --platform android --profile preview --non-interactive` | Uploaded; **waiting in EAS queue** |
| `eas build --local` on Windows | **Failed** — EAS requires macOS or Linux for local Android builds |
| `eas build:download` (old build) | **404** — artifact no longer on Expo servers |
| Device / emulator install test | **Not performed** — no APK file on disk |

---

## 4. How to obtain the APK when EAS finishes

From `mobile/`:

```powershell
eas build:view 50971c4c-2488-43a3-9e04-a04d6c084384
```

When status is **finished**, download:

```powershell
eas build:download --build-id 50971c4c-2488-43a3-9e04-a04d6c084384 --non-interactive
```

The CLI prints the **Application Archive URL** (direct HTTPS link to the `.apk`). Copy that URL for installation on devices (internal distribution).

If the build stays **in queue** for more than ~30 minutes, check Expo status / account limits on https://expo.dev or start a new preview build after canceling the stuck one.

---

## 5. Production web dependency

The APK is a **WebView shell**. It loads **`https://layaly-pos.vercel.app`**, which was **deployed successfully** on 2026-10-26 (see `docs/PRODUCTION-DEPLOYMENT-REPORT.md`). Installing an older 1.0.0 APK would still load the **current** web app URL if unchanged in `eas.json`.

**In-place update** from 1.0.0 → **1.0.1** requires the **new** signed APK (versionCode **2**).

---

## 6. Tests

No Android-specific automated tests were run. Web tests before deploy: **76/76** Jest (root `npm test`).

---

## 7. Direct download link

**None at report time.** No `.apk` exists under the repository `releases/` folder.

**When ready:** use the **Application Archive URL** from build `50971c4c-2488-43a3-9e04-a04d6c084384` (Expo dashboard link above).

---

## 8. Final verdict

**`WEB DEPLOYED — APK BLOCKED`**

Signing identity is preserved on EAS; the **1.0.1 / versionCode 2** build is submitted but **not finished**. Complete download via Expo when status is `finished`.

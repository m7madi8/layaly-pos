# APK build report — Layali Café POS

**Date:** 2026-10-26  
**Android shell:** Expo app in `mobile/` (`com.layali.cafepos`, version `1.0.0`)  
**APK produced:** **No**  
**Device install test:** **Not performed**  
**Verdict:** **BLOCKED** — tied to **`PRODUCTION RELEASE BLOCKED`**

---

## 1. Architecture (verified in repo)

| Item | Value |
|------|--------|
| Package / application id | `com.layali.cafepos` (`mobile/app.config.js`) |
| Expo slug | `layali-cafe-pos` |
| Runtime | WebView / browser loads **`EXPO_PUBLIC_APP_URL`** (default `https://layaly-pos.vercel.app`) |
| Firebase config | Lives in **deployed web app** env, not embedded as native Firebase SDK in `mobile/` |
| EAS profiles | `preview` → APK internal; `production` → **AAB** (`mobile/eas.json`) |

Releasing a production APK **without** a verified production web backend does not deliver a safe POS — the APK is only a shell around the URL.

---

## 2. Why no APK was built

1. **Release gates failed** — see `docs/PRODUCTION-DEPLOYMENT-REPORT.md`.
2. **Staging/production backend not verified** — acceptance not run.
3. **EAS production build** requires Expo account credentials (`eas login`), project secrets, and typically **upload keystore** — not available in this environment; **no signing keys were accessed or created**.
4. **No fabricated artifacts** — policy forbids claiming an APK exists without generation and verification.

---

## 3. Signing and update continuity

| Requirement | Status |
|-------------|--------|
| Preserve `com.layali.cafepos` | Config matches repo |
| Release signing for updates | **Unknown** — owner must confirm existing keystore in EAS/Google Play |
| If keystore lost | **Stop** — new key cannot update existing Play installs |

**Do not** generate a new release keystore without confirming the previous one — risk of **uninstall-only** updates.

---

## 4. Build commands (owner, after gates pass)

**Preview APK (internal distribution):**

```bash
cd mobile
npm install
# Set EXPO_PUBLIC_APP_URL to verified production or staging URL
eas build --platform android --profile preview
```

**Production (Play Store — AAB, not APK):**

```bash
eas build --platform android --profile production
```

For a **local** release APK without EAS, use Android Gradle only if a bare workflow exists — current repo is **Expo managed**; standard path is **EAS**.

After web production deploy:

1. Set `EXPO_PUBLIC_APP_URL` to the **verified** production URL.
2. Bump `version` / `android.versionCode` in `app.config.js` per release policy.
3. Build with existing EAS credentials.
4. Install APK on device; test login, sale, shift (real Firebase project behind URL).

---

## 5. Download link

**None.** No APK file was generated in this pass.

---

## 6. Final verdict

**APK release BLOCKED** until:

- `PRODUCTION RELEASE COMPLETE` (or staged URL for internal preview APK only), and  
- EAS/signing credentials available to the owner, and  
- Device smoke test completed and documented.

**Overall release:** **`PRODUCTION RELEASE BLOCKED`**

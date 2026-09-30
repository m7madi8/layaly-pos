# Production readiness — ليالي كافيه POS

## Required environment variables

Copy `.env.example` → `.env.local` (local) or add in **Vercel → Settings → Environment Variables** (Production + Preview + Development).

**Do not commit secret values.** Values are baked in at **build time** — after any change, run **Redeploy** on Vercel.

```env
REACT_APP_DEMO_MODE=false

REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=

# Optional — login email (must match Firebase Auth user)
REACT_APP_ADMIN_EMAIL=admin@layali.cafe
```

`REACT_APP_DEMO_MODE=true` enables **local demo only** (localStorage). Leave `false` for the café.

---

## Manual checklist (outside code)

| Step | Action |
|------|--------|
| Firebase Auth | Enable Email/Password |
| Admin user | Create user with same email as `REACT_APP_ADMIN_EMAIL` |
| Firestore | Create database + publish `firestore.rules` |
| Authorized domains | Add your Vercel domain + `localhost` |
| Vercel env | All variables above |
| Redeploy | After every env change |
| Store setup | Business profile, menu, prices, stock |
| Password | Use a strong password in Firebase Auth (not documented in repo) |
| Printer | Test Bluetooth (Chrome/Android) or browser print fallback |

---

## Deploy Firestore rules

```bash
npm i -g firebase-tools
firebase login
firebase use layaly-cafe-13c2b
firebase deploy --only firestore:rules
```

---

## Launch test (one day simulation)

1. Login on Device A (cashier) and Device B (manager) — same site URL.
2. Device A: POS → add items → pay cash → confirm order saved.
3. Device B: Orders list updates without refresh.
4. Device A: add product → appears on B inventory/POS.
5. Reports: today revenue matches orders.
6. Print receipt (Bluetooth or browser print).
7. Logout on both devices.

---

## Backup

Use Firebase Console → Firestore → export, or scheduled exports on Blaze. No automatic backup is built into the app.

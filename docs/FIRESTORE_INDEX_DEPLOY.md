# Firestore composite indexes — staging deploy

**Do not deploy until project ID and deploy gate are confirmed.**

## Validated in repo (`firestore.indexes.json`)

| Collection (under `users/{uid}/…`) | Fields | Used by |
|-----------------------------------|--------|---------|
| `checks` | `partyId` ASC, `createdAtMs` DESC | `ChecksPanel.js` |

## Single-field / auto indexes (emulator + typical production)

These use one inequality + `orderBy` on the **same** field (`timestamp`, `date`, etc.) or equality-only filters:

- `orders`: `timestamp >=` + `orderBy timestamp desc` (dashboard, reports, orders filters)
- `orders`: `timestamp` range (yesterday / custom)
- `expenses`: `orderBy date desc` + `limit`
- `cashMovements`, `vaultMovements`, `openBills`, `playstationSessions` — ordered lists with `limit`
- `inventoryLayers`: `where productId ==`

If Firebase Console shows **“Create index”** for a new query, add the suggested composite to `firestore.indexes.json` and redeploy indexes only.

## Deploy command (after approval)

Replace `<PROJECT_ID>` with **staging** project (never guess production):

```powershell
subst L: "D:\completed\لياري كافي"
cd L:
firebase deploy --only firestore:indexes --project <PROJECT_ID>
```

Verify in Console → Firestore → Indexes → status **Enabled** before production cutover.

## Emulator validation

```powershell
cd L:
npm run test:rules
npm run test:functions:financial
```

Checks query is exercised indirectly via client; index missing surfaces as failed query in browser Console on ChecksPanel.

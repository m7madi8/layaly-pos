# Firestore Optimization — Production Deploy Checklist

**Do not deploy without explicit owner approval.**

## Pre-deploy

- [ ] `CI=true npm run build` green.
- [ ] `npm test -- --watchAll=false` green (at minimum `firestoreViewDataPolicy`, `firestoreOrderQueries`, `firestoreReadMetrics`).
- [ ] Review diff: no financial write logic changes without tests.
- [ ] Confirm `REACT_APP_FIRESTORE_PERSISTENCE` intent (default on in production build).
- [ ] Snapshot Firebase Console **Firestore reads** for trailing 7 days (baseline).

## Staging / smoke

- [ ] Employee: login → POS → complete sale → expenses → purchases → traders → return POS (one tab).
- [ ] Admin: dashboard KPIs match cash expectations; employees financial panel loads.
- [ ] Settings metrics: note `billableDocumentReads` after smoke.
- [ ] Hard refresh once; confirm products/inventory prices match Firestore.
- [ ] Second tab: confirm persistence does not corrupt writes (optional).

## Deploy

- [ ] Push to `main` → Vercel success.
- [ ] No Firebase rules deploy required for batch 1.
- [ ] If new composite indexes needed (staff expenses query): deploy `firestore.indexes.json` before SPA.

## Post-deploy (48h)

- [ ] Compare Console reads vs baseline (same weekday).
- [ ] Support: instruct staff **single POS tab** during service.
- [ ] Rollback plan: redeploy previous Vercel deployment; set `REACT_APP_FIRESTORE_PERSISTENCE=false` if persistence issue.

## Escalation

If reads still > 50k/day: enable Blaze billing OR continue Batch 2 summary work — do not disable listeners for financial screens.
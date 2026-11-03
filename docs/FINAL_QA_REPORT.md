# PHASE 7 — Final QA

## Test matrix (manual + automated)

| Area | Check | Status |
|------|--------|--------|
| Gate | App blocked until shift open + on-duty selected | Pass (UI) |
| Benefits | Off-duty staff rejected in service | Pass (unit + service) |
| Shift 2 close | `businessDaySummaries` row created | Pass (code path) |
| FIFO purchase | Layer appended on purchase expense | Pass (code path) |
| Employee edit order | Employee can open edit from orders/customers | Pass |
| Legacy shift | No `onDutyStaffIds` → benefits unchanged | Pass (unit) |
| npm test | Unit suites | Run in CI |
| npm run build | Production bundle | Run in CI |
| Rules hardened | `tests/security/firestore.rules.test.js` | Existing suite (no prod deploy) |

## Automated

- `tests/shiftOnDuty.unit.test.js`
- `tests/functions/cashShift*.test.js` (on-duty on open)
- `tests/security/firestore.rules.test.js`

## Production safety

- No `firebase deploy` performed in this roadmap execution.
- No bulk delete on live data.

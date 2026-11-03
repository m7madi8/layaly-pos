# Performance baseline (local measurement)

Run on: 2026-11-03 (agent session, Windows, project `cafe-pos`).

## Build time (production bundle)

Measure with:

```powershell
Set-Location "d:\completed\ليالي كافي"
Measure-Command { npm run build }
```

Record `TotalSeconds` from output — **do not invent numbers**; paste into FINAL_REQUIREMENTS_COMPLIANCE.md after each run.

## Firestore listener inventory (static code review)

Active `onSnapshot` hooks in `src/App.js` (approximate):

| Trigger | Collections | Notes |
|---------|-------------|--------|
| Always (logged-in user) | `products` | Full catalog |
| Admin + view | `orders` (500), `expenses` (800), `suppliers`, `employeeBenefits`, `staffMembers` | Scoped by `currentView` |
| Employee + view | `orders`, `expenses`, `suppliers`, `staffMembers`, `employeeBenefits`, `cashShifts` | Finance views |
| POS/cash | `cashShifts` (30), `customers`, `openBills` | Scoped |

**Not measured in Firebase console in this session** — use Emulator or Firebase Usage tab before/after adopting `businessDaySummaries` on dashboard.

## Startup deferrals (post-change)

- Employee benefit expense sync still delayed 8s on admin `expenses` view only.
- `EmployeesView` lazy-loaded.

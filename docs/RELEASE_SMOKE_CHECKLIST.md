# Layali Café — Manual Smoke Checklist (Staging / Emulator)

Use **Staging** or **Firebase Emulator** for steps that write data. Do **not** run destructive or test sales on production.

## Auth & session

- [ ] Admin login (password + role session)
- [ ] Employee login (PIN / role session)
- [ ] Logout → login again (same account)
- [ ] Disconnect device (`signOut`) → verify staff/products listeners cleared (no stale UI)
- [ ] Switching accounts (if applicable): no prior user data visible

## Dashboard

- [ ] Open dashboard — calendar period banner shows **Asia/Hebron** date
- [ ] Cash day note shows `getCashDayKey` and start hour (12:00)
- [ ] Compare «كاش اليوم» with a known calendar-day order (not cash-day shift total)
- [ ] Around local midnight Hebron: new calendar day reflected after refresh

## POS & inventory

- [ ] POS sale (cash) — stock decrements, receipt OK
- [ ] Debt sale — customer balance updates
- [ ] Open bill suspend / resume / close
- [ ] Partial return (if used) — stock + cash/debt

## Cash

- [ ] Open cash shift (shift 1 / 2 flow)
- [ ] Cash movement (deposit / withdrawal)
- [ ] Close shift — vault transfer; shift 2 close archives business day

## Customers & orders

- [ ] Customer balance / payment
- [ ] Orders list — filter today / load more
- [ ] ChecksPanel on supplier — checks list loads (after indexes deployed)

## Reports

- [ ] Reports today / last week — totals match filtered orders
- [ ] Reports «all» — **partial data warning** visible
- [ ] Last month with >400 orders/day scenario — cap warning visible

## Read optimization (spot check)

- [ ] Settings → Firestore metrics panel loads
- [ ] Navigate traders — products listener off (network tab / metrics)
- [ ] Dashboard — no full expenses/customers listeners

## Automated gates (CI / release)

From `L:\` after `subst L: "D:\completed\لياري كافي"`:

```powershell
npm run test:functions:financial   # 12 tests — release gate
npm run test:rules                  # 10 tests — hardened rules
npm run test:functions:unit         # 28 tests
$env:CI="true"; npm test -- --watchAll=false
```

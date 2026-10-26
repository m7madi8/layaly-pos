# Phase 4 — Cash shift lifecycle (trusted server path)

**Date:** 2026-10-26  
**Deploy / production flags:** Not changed (`REACT_APP_TRUSTED_ORDERS` and `REACT_APP_TRUSTED_CASH_SHIFTS` remain off by default).  
**Production readiness:** **Not production-ready** (legacy client writes still default).

---

## 1. Existing cash-shift behavior and schema

### Collections

| Path | Purpose |
|------|---------|
| `users/{uid}/cashShifts/{shiftId}` | Shift aggregate: status, opening/closing balances, rolled-up cashSales/Deposits/Withdrawals/Refunds, `expectedClosingBalance`, `actualClosingBalance`, `difference`, operator metadata |
| `users/{uid}/cashMovements/{id}` | Ledger lines: `shiftId`, `type` (`sale` \| `refund` \| `deposit` \| `withdrawal`), `amount`, optional `orderId` / `orderNumber`, closing flags `isClosingWithdrawal` / `toVault` |
| `users/{uid}/cashShiftIdempotency/{key}` | **New (server)** — dedupe open shift + manual movements (not used by legacy client) |

### Lifecycle (legacy client — `src/services/cashShiftService.js`)

| Action | Entry | Notes |
|--------|-------|-------|
| Open | `openCashShift` | Checks `findOpenCashShift` **outside** transaction (race possible). `openingBalance >= 0` via `Math.max(0, …)` (negative input silently clamped to 0). |
| Sale / refund | `recordCashSaleInTransaction`, `recordCashRefundInTransaction`, or order `App.js` transaction | Tied to **first** open shift (`where status==open limit 1`). No movement if no open shift (sale still completes). |
| Deposit / withdrawal | `recordCashDeposit`, `recordCashWithdrawal` | Transaction per movement; rejects closed shift and negative expected cash. |
| Close | `closeCashShift` | `actualClosingBalance` counted; `closingWithdrawal = max(0, expected - actual)` → movement + **vault credit** (`from_cash_close`). `difference = actual - finalExpected`. Over-cash (actual > expected) is **not** auto-deposited (comment in code). |
| Read / UI | `CashShiftView`, `App.js` listeners, `cashDayGate.js` | Gate for **when** to prompt open shift (shift periods 1/2, 12:00 rule); not a server lock. |

### Trusted order engine (before Phase 4)

- Recorded sale/refund only when an open shift existed; **did not fail** cash checkout if no shift.
- Cash movement logic duplicated in `orderEngine.js` (sale/refund only).

---

## 2. Accounting formulas

**Unchanged semantics** (shared `computeExpectedCash` in `functions/lib/cashShiftMath.js` and `src/utils/cashShiftMath.js`):

```
expectedClosing =
  openingBalance
  + cashSales
  + cashDeposits
  − cashWithdrawals
  − cashRefunds
```

| Concept | Included in cash received? |
|---------|----------------------------|
| Cash / mixed (cash portion) | Yes → `cashSales` movement |
| Debt-only / pending | No |
| Compliment | No |
| Customer debt | No (customer `balance` only) |

**On close (unchanged):**

- `closingWithdrawal = max(0, expectedBeforeClose − actualCounted)`
- After closing withdrawal movement, `expectedClosingBalance` is recomputed including that withdrawal.
- `difference = actualCounted − finalExpected`
- Vault `balance` increases by `closingWithdrawal` when &gt; 0.

### After Phase 4 (trusted path only)

- **Cash checkout / cash refund on cancel** require an **open** shift (`لا توجد وردية كاش مفتوحة…`).
- **Open shift** uses a **transaction** + query for existing `status=='open'` (one active shift).
- **Close** reads vault **before** writes (client close fixed the same read-order bug).

---

## 3. Files changed

| File | Change |
|------|--------|
| `functions/lib/cashShiftEngine.js` | **New** — open / close / deposit / withdrawal + shared `appendCashMovementInTx` |
| `functions/lib/vaultAccounting.js` | **New** — server `applyVaultCreditInTx` for close |
| `functions/lib/orderEngine.js` | Uses `cashShiftEngine`; requires open shift for cash in/out |
| `functions/index.js` | Callables: `openCashShift`, `closeCashShift`, `recordCashShiftMovement` |
| `src/services/cashShiftService.js` | Close: vault read before movement writes |
| `src/services/secureFunctions.js` | `isTrustedCashShiftsEnabled`, call helpers (flag off by default) |
| `firestore.rules.hardened` | Block client `cashShiftIdempotency` |
| `tests/functions/cashShift.emulator.test.js` | **New** — 15 persistence scenarios |
| `tests/functions/cashShift.unit.test.js` | **New** |
| `tests/security/firestore.rules.test.js` | `cashShiftIdempotency` denial |
| `package.json` | Emulator script includes cash-shift tests |

**Not changed:** `App.js` still calls legacy `openCashShift` / `closeCashShift` unless a future flag wires callables.

---

## 4. Security issues found and fixed

| Issue | Severity | Fix |
|-------|----------|-----|
| Two open shifts (race on open) | High | Server `executeOpenCashShift` transactional query |
| Sale with cash but no / closed shift (trusted) | High | `executeCompleteOrder` throws if `cashPaid > 0` and no open shift |
| Cancel cash refund without open shift (trusted) | Medium | Same for refunds |
| Close transaction read-after-write on vault (client + risk on server) | Medium | Read vault before movement writes |
| Duplicate `firebase-admin` FieldValue (orders) | Medium | Already fixed Phase 3; shift engine uses `serverTimestamp(db)` |
| Client can still write shifts/movements in **legacy** rules | High | Unchanged until hardened + callable migration |
| Employee role bypass (localStorage) | High | Callables use JWT claims in hardened mode; legacy bridge still allows any authed UID |
| Manual movement duplicate submits | Medium | Optional `idempotencyKey` on server movements / open |

---

## 5. Integration scenarios executed (Firestore emulator)

**Run:** `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` with emulator running (`subst L:` for start on Arabic path).

| # | Scenario | Result |
|---|----------|--------|
| 1 | Open valid opening balance | **Pass** |
| 2 | Reject negative opening | **Pass** |
| 3 | Unauthorized shift ops | **Not automated** — relies on `requireOrderCaller` (claims / legacy bridge); no callable auth emulator test in this phase |
| 4 | Second open shift rejected | **Pass** |
| 5 | Cash sale on correct shift | **Pass** |
| 6 | Mixed → cash portion only | **Pass** |
| 7 | Debt + compliment → no cash movements | **Pass** |
| 8 | Cancel refund once | **Pass** |
| 9 | Deposit + withdrawal | **Pass** |
| 10 | Expected closing on close | **Pass** (actual = expected, vault 0) |
| 11 | Sale without / on closed shift | **Pass** (rejected, no order) |
| 12 | Close vs sale race | **Not explicitly tested** — relies on Firestore transaction retries on shift doc |
| 13 | Edit closed shift | **Not server-enforced on legacy client**; hardened rules deny client writes |
| 14 | Duplicate movement (idempotency) | **Pass** |
| 15 | Failed withdrawal → no movement | **Pass** |

**Also re-run:** `orderEngine.emulator.test.js` **12/12 pass** (orders still consistent with shift rules).

---

## 6. Remaining direct client writes

| Path | Status |
|------|--------|
| `openCashShift`, `closeCashShift`, deposits/withdrawals | **Client-side** (default UI) |
| Order cash sale/refund in legacy `App.js` | **Client-side** |
| Trusted callables | **Server** — not wired in UI without `REACT_APP_TRUSTED_CASH_SHIFTS` |
| Shift history / dashboard reads | Client read (OK) |

---

## 7. Compatibility risks (hardened rules)

Enabling `securityMode: 'hardened'` **without** migrating UI to callables will block:

- Opening/closing shifts from `CashShiftView`
- Legacy order checkout cash movements
- Manual deposits/withdrawals

**Safe order of rollout:** deploy functions → staging with `REACT_APP_TRUSTED_ORDERS` + `REACT_APP_TRUSTED_CASH_SHIFTS` → verify → then hardened rules.

**Workflows that still break when hardened alone:** open bills, vault (except close-vault path on server close), catalog edits (cashier allowed), employee PIN UX.

---

## 8. Shift lifecycle verified on emulator?

**Yes, for the trusted engine and callables** — 15 dedicated cash-shift tests + 12 order tests touching movements.

**No, for the default legacy client path** — same code paths as before, aside from close vault read-order fix.

---

## 9. Test run summary (this session)

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | **16/16 pass** |
| `npm run test:functions:emulator` | **27/27 pass** (12 order + 15 shift) — emulator required |
| `npx jest -c jest.rules.config.js` | **7/7 pass** — emulator required |
| `npm test -- --watchAll=false` | **74 pass**, `App.test.js` fail (TextEncoder/jspdf, pre-existing) |
| `npm run build` | **Success** |

---

## 10. Prerequisites before deployment

1. Wire `App.js` / `CashShiftView` to callables when `REACT_APP_TRUSTED_CASH_SHIFTS=true` (mirror orders flag pattern).
2. Transactional **client** `openCashShift` or force trusted open only.
3. Callable auth tests with Auth emulator + claims (`admin` / `cashier`).
4. Explicit concurrency test (parallel sale + close).
5. Employee session model (Phase 2 options A/B/C).
6. Do **not** enable hardened rules or trusted flags in production until checklist above is green on staging.

---

## 11. Production-readiness verdict

**Cash accounting is not production-safe end-to-end** while the POS defaults to client-trusted shift and order writes.

**Progress:** Server shift lifecycle implemented, idempotency hooks added, order engine enforces open shift for cash, emulator evidence for core invariants on the **trusted** path.

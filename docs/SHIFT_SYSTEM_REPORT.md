# PHASE 2 — Shifts & Mandatory Gate

## Delivered

- `DailyCashOpenModal`: operator name, opening amount, **multi-select on-duty staff**, opening difference display.
- `openCashShift` requires non-empty `onDutyStaffIds`, stores `expectedOpeningBalance` and `openingDifference`.
- **App gate**: when `dailyCashGate.show`, only the opening modal is rendered (no POS/expenses underneath).
- `useShiftOverdueWarning`: alert every 5 minutes if shift 2 still open after noon on the next cash day.
- Trusted callables updated in `functions/lib/cashShiftEngine.js` for on-duty fields and close metadata.

## Tests

- Emulator cash shift tests pass `onDutyStaffIds` on every open.

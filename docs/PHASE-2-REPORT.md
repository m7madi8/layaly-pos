# Phase 2 — Trusted transaction engine (local, not deployed)

**Date:** 2026-10-26  
**Production readiness:** **Not** production-ready.

## Compatibility map

See [`PHASE-2-COMPATIBILITY-MAP.md`](./PHASE-2-COMPATIBILITY-MAP.md).

## Functions implemented

| Callable | Purpose |
|----------|---------|
| `completeOrder` | Server pricing, stock, debt, cash sale, idempotency |
| `cancelOrder` | Cancel with stock/debt/cash refund (mirrors client) |
| (Phase 1) `resetSalesAndCustomerLedgers`, `bootstrapAdminClaim`, PIN verify | Unchanged |

**Engine modules:** `functions/lib/orderEngine.js`, `pricingAndPayment.js`, `productPricing.js`, `orderAccounting.js`, `authz.js`.

## Accounting rules preserved

- Decimal money rounded to 2 places (same as client).
- Tax/service charge remain **0**.
- Payment types: cash, debt, mixed, pending, compliment (compliment/custom final price → **admin claim** on server).
- Order edit restores **product stock only** (ingredients on edit not restored — legacy behavior).
- External hookah `::hookah-external` line → نخلة 20₪ when product matches plain نخلة.

## Frontend migration

- **Default:** legacy client Firestore transaction (unchanged).
- **Opt-in:** `REACT_APP_TRUSTED_ORDERS=true` + Functions deployed or emulated (`REACT_APP_FUNCTIONS_EMULATOR=true`).
- `buildTrustedCompleteOrderPayload` sends product IDs, quantities, weights, sessions, addon **names** only — no prices.
- `completeOrder` / `handleCancelOrder` call callables when flag enabled.

## Remaining direct-write paths

- Open bills, cash shift open/close, vault, catalog CRUD, expenses — still client.
- Legacy `completeOrder` path when flag off.

## Firestore rules

- `firestore.rules` — unchanged (production).
- `firestore.rules.hardened` — includes `idempotency` as server-only financial path.

## Authorization (unresolved)

- Employee still uses `localStorage` + shared Firebase session.
- Server accepts **legacy bridge**: authenticated owner when `securityMode !== 'hardened'`.
- Hardened mode requires JWT `admin` or `cashier` claim.

## Tests

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | Run locally — 6 unit tests on payment/discount |
| `npm run test:functions:integration` | **Blocked without Java** + emulators + `npm install` in `functions/` |
| `npm run test:rules` | **Blocked without Java** (Phase 1) |

## Deploy prerequisites (no deploy in this phase)

1. `cd functions && npm install`
2. Set Functions secrets `EMPLOYEE_PIN`, `VAULT_PIN`
3. Deploy Functions; `bootstrapAdminClaim`; refresh token
4. Enable `REACT_APP_TRUSTED_ORDERS=true` on frontend after smoke test
5. Migrate employee auth (see remediation plan)
6. Switch `securityMode` + hardened rules when all writes migrated

## Release blockers

- Client-trusted path still default
- No server-side order **edit** audit (`orderEdits`) in callable yet for full parity
- Integration/emulator suite not verified on CI machine
- Employee/vault secrets still in client bundle when not using server PIN flow

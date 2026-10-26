# Phase 2 — Compatibility map (verified against codebase)

## Financial write paths (client today)

| Flow | Collections touched | Callable target |
|------|---------------------|-----------------|
| `completeOrder` (new/edit) | orders, counters, products, ingredients, customers, cashShifts, cashMovements, playstationSessions, assetMovements, orderEdits | `completeOrder` |
| `handleCancelOrder` | orders, products, customers, playstationSessions, cashShifts, cashMovements | `cancelOrder` |
| Open bill close | openBills | **Still client** after order (same as today) |
| Cash shift open/close | cashShifts, cashMovements, vault | Phase 3 |
| Reset ledgers | orders, openBills, orderEdits, customers, counters | `resetSalesAndCustomerLedgers` (Phase 1) |

## Order line pricing (server must mirror)

| Type | Authority |
|------|-----------|
| `standard` | `product.price` + validated `addOns` option prices |
| `weight` | `amountFromWeight(product, weightGrams)` |
| `time` | `playstationSessions/{id}.price` after `ended` |
| External hookah cart id `*::hookah-external` | Plain «نخلة» → 20₪ (`hookahExternalSale`) |

## Payment types supported

`cash`, `debt`, `mixed`, `pending` (unpaid hold), `compliment` — **no card/QRIS settlement**.

- `compliment` / `customPrice`: **admin claim only** on server.
- Tax/service charge: always **0** (matches `appSettings` in client).

## Edit orders

- Allowed via `editingOrderId`; restores **product stock only** (ingredients not restored on edit — existing behavior preserved).
- Order number immutable; `orderEdits` audit row on edit.

## Authorization bridge

Until employee Auth migration completes:

- `securityMode !== 'hardened'`: any authenticated owner UID may call order functions (legacy bridge).
- `securityMode === 'hardened'`: requires JWT claim `role` ∈ `admin`, `cashier`.

## Idempotency

`users/{uid}/idempotency/{key}` stores `{ orderId, orderNumber, status }` — client must send UUID per checkout attempt.

## Not migrated in Phase 2

- Order **edit** via trusted path: supported in `completeOrder` when `editingOrderId` set.
- Demo mode: stays on client `demoBackend`.
- Hardened rules deploy: manual after full migration.

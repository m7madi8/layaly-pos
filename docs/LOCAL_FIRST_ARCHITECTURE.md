# Local-First Architecture — Layali POS

```
Cloud Firestore
      ↓ onSnapshot / getDocs (policy-bound)
Persistent IndexedDB (Firebase SDK, production default)
      ↓
In-memory shared stores (src/services/localFirst/*)
      ↓
React state (App.js)
```

## Read policy (`readPolicy.js`)

| Collection | Policy |
|------------|--------|
| products | REALTIME_CRITICAL via `productCatalogStore` |
| orders, cashShifts, openBills, vault | REALTIME_CRITICAL |
| customers, suppliers | CACHE_FIRST paginated directories |
| staffMembers | CACHE_FIRST shared listener |
| businessDaySummaries | CACHE_ONLY (`reportSummaryCache`) |
| expenses (finance views) | REALTIME_CRITICAL (bounded limits) |

## Module map

| Module | Role |
|--------|------|
| `productCatalogStore.js` | Single catalog listener per uid; memory retained; `patch*` on mutations; `refreshProductsForSale` before checkout |
| `paginatedDirectoryStore.js` | Cursor pages + page cache keys |
| `customerDirectoryStore.js` | Customers 25/page; prefix search; `loadCustomersWithPositiveBalance` for dashboard; `fetchCustomerAuthoritative` before debt |
| `supplierDirectoryStore.js` | Suppliers 25/page |
| `reportSummaryCache.js` | TTL cache for closed business days |

## Cache invalidation

| Event | Action |
|-------|--------|
| Logout / auth cleared | `clearFirestoreClientSessionState` → catalogs, directories, query cache, metrics, summaries |
| Product write | `patchProductInCatalog` / listener delta |
| Customer/supplier write | `upsert*Local` |
| Customer delete | `removeCustomerLocal` |
| Pagination force | `fetchDirectoryPage({ force: true })` |
| Business day close | invalidate summaries on next admin archive load (TTL 5m) |

## Financial safety

- Checkout: `refreshProductsForSale` + `fetchCustomerAuthoritative` when `debtAmount > 0`
- Dashboard debt totals: `where('balance', '>', 0)` query — not paginated list guess
- Writes unchanged: Firestore transactions / rules authoritative

## Security

- Stores keyed by `uid` — cleared on `clearFirestoreClientSessionState`
- Role still enforced in UI + Firestore rules; cache is not an auth boundary
- Shared devices: logout clears app-layer cache; IndexedDB may retain until browser data cleared — document for owners

## Measurements

- In-app: Settings → Firestore metrics (`fromCache` in metrics layer)
- Script: `node scripts/estimate-firestore-reads.js employee`
- Authoritative: Firebase Console Usage

## Removed / avoided

- Full-collection **realtime** `onSnapshot` on `customers` and `suppliers`
- Re-subscribing products/suppliers on every `currentView` tick (same boolean gate)

## Not yet done (Batch C)

- Dashboard KPIs from summaries only (live today orders still used)
- Supplier detail lazy transaction fetch
- Explicit invalidate on shift close for summary cache
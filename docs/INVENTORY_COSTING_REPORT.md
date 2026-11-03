# PHASE 4 — Inventory Cost Layers (FIFO)

## Delivered

- Collection `inventoryLayers` via `inventoryLayerService.js` (append on purchase, FIFO consume).
- `purchaseService`: append layer + `lastPurchaseUnitCost` (keeps `cost` as last purchase for legacy UI).
- FIFO consume on **orders** (`cogsTotal` on order) and **inventory employee benefits** (`cogsAmount`).
- Shortfall falls back to `product.cost` via `legacyProductCogs`.

## Migration

- Historical layers not backfilled by default; purchases after deploy create layers.

## Index

- Composite query `inventoryLayers` where `productId` — add Firestore index if emulator/production prompts.

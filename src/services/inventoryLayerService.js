import { db, doc, collection, serverTimestamp, query, where } from '../firebaseClient';
import { roundMoney } from '../utils/employeeBenefitAccounting';

const layersCol = (uid) => collection(db, 'users', uid, 'inventoryLayers');

function layerQuery(uid, productId) {
  if (!uid || !productId) return null;
  return query(layersCol(uid), where('productId', '==', productId));
}

export function applyInventoryLayerUpdates(tx, updates) {
  for (const u of updates || []) {
    if (!u?.ref) continue;
    tx.update(u.ref, {
      remainingQuantity: u.remainingQuantity,
      updatedAt: serverTimestamp(),
    });
  }
}

/** Read-only FIFO plan (use before any writes in the same transaction). */
export async function planInventoryLayersFifo(tx, uid, productId, quantityNeeded) {
  let need = Number(quantityNeeded) || 0;
  if (!(need > 0) || !productId) return { cogs: 0, layers: [], shortfall: 0, updates: [] };

  const q = layerQuery(uid, productId);
  if (!q) return { cogs: 0, layers: [], shortfall: need, updates: [] };

  const snap = await tx.get(q);
  const layers = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((l) => (Number(l.remainingQuantity) || 0) > 0)
    .sort((a, b) => (Number(a.purchaseDateMs) || 0) - (Number(b.purchaseDateMs) || 0));

  let cogs = 0;
  const consumed = [];
  const updates = [];
  for (const layer of layers) {
    if (need <= 0) break;
    const rem = Number(layer.remainingQuantity) || 0;
    if (rem <= 0) continue;
    const take = Math.min(rem, need);
    const unit = Number(layer.unitCost) || 0;
    cogs += take * unit;
    need -= take;
    updates.push({ ref: layer.ref, remainingQuantity: roundMoney(rem - take) });
    consumed.push({ layerId: layer.id, quantity: take, unitCost: unit });
  }

  if (need > 0.0001) {
    return { cogs: roundMoney(cogs), layers: consumed, shortfall: need, updates };
  }
  return { cogs: roundMoney(cogs), layers: consumed, shortfall: 0, updates };
}

/** Read-only LIFO restore plan. */
export async function planInventoryLayersLifoRestore(tx, uid, productId, quantityToRestore) {
  let need = Number(quantityToRestore) || 0;
  if (!(need > 0) || !productId) return { restored: 0, layers: [], shortfall: 0, updates: [] };

  const q = layerQuery(uid, productId);
  if (!q) return { restored: 0, layers: [], shortfall: need, updates: [] };

  const snap = await tx.get(q);
  const layers = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (Number(b.purchaseDateMs) || 0) - (Number(a.purchaseDateMs) || 0));

  let restored = 0;
  const restoredLayers = [];
  const updates = [];
  for (const layer of layers) {
    if (need <= 0) break;
    const initial = Number(layer.initialQuantity) || 0;
    const rem = Number(layer.remainingQuantity) || 0;
    const room = initial - rem;
    if (room <= 0.0001) continue;
    const add = Math.min(room, need);
    updates.push({ ref: layer.ref, remainingQuantity: roundMoney(rem + add) });
    restored += add;
    need -= add;
    restoredLayers.push({ layerId: layer.id, quantity: add });
  }

  return {
    restored: roundMoney(restored),
    layers: restoredLayers,
    shortfall: need > 0.0001 ? need : 0,
    updates,
  };
}

/** FIFO consume — returns total COGS and consumption detail. */
export async function consumeInventoryLayersFifo(tx, uid, productId, quantityNeeded) {
  const plan = await planInventoryLayersFifo(tx, uid, productId, quantityNeeded);
  applyInventoryLayerUpdates(tx, plan.updates);
  return {
    cogs: plan.cogs,
    layers: plan.layers,
    shortfall: plan.shortfall,
  };
}

/** LIFO restore — add quantity back to cost layers newest-first (reverse of FIFO sale). */
export async function restoreInventoryLayersLifo(tx, uid, productId, quantityToRestore) {
  const plan = await planInventoryLayersLifoRestore(tx, uid, productId, quantityToRestore);
  applyInventoryLayerUpdates(tx, plan.updates);
  return {
    restored: plan.restored,
    layers: plan.layers,
    shortfall: plan.shortfall,
  };
}

/**
 * Append FIFO cost layer on purchase (does not overwrite legacy stock cost on product except lastPurchaseUnitCost).
 */
export async function appendInventoryLayerInTransaction(tx, uid, { productId, purchaseExpenseId, quantity, unitCost, purchasedAtMs }) {
  const qty = Number(quantity) || 0;
  const cost = roundMoney(unitCost);
  if (!(qty > 0) || !(cost >= 0)) return null;
  const layerRef = doc(layersCol(uid));
  tx.set(layerRef, {
    productId,
    purchaseExpenseId: purchaseExpenseId || null,
    initialQuantity: qty,
    remainingQuantity: qty,
    unitCost: cost,
    purchaseDateMs: purchasedAtMs || Date.now(),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return layerRef.id;
}

/**
 * Restore stock to layers recorded on the order line at sale time; fallback to LIFO.
 */
export async function restoreInventoryForPartialReturn(tx, uid, productId, line, qtyReturned) {
  const units = Number(qtyReturned) || 0;
  if (!(units > 0)) return { restored: 0, method: 'none' };

  const consumption = Array.isArray(line?.inventoryConsumption) ? line.inventoryConsumption : [];
  if (consumption.length > 0) {
    let needUnits = units;
    const restoredLayers = [];
    for (const slice of consumption) {
      if (needUnits <= 0) break;
      const sliceQty = Number(slice.quantity) || 0;
      if (!(sliceQty > 0) || !slice.layerId) continue;
      const take = Math.min(sliceQty, needUnits);
      const layerRef = doc(layersCol(uid), slice.layerId);
      const layerSnap = await tx.get(layerRef);
      if (!layerSnap.exists()) continue;
      const rem = Number(layerSnap.data().remainingQuantity) || 0;
      const initial = Number(layerSnap.data().initialQuantity) || 0;
      const room = initial - rem;
      const add = Math.min(take, room > 0 ? room : take);
      tx.update(layerRef, {
        remainingQuantity: roundMoney(rem + add),
        updatedAt: serverTimestamp(),
      });
      restoredLayers.push({ layerId: slice.layerId, quantity: add, unitCost: slice.unitCost });
      needUnits -= add;
    }
    if (needUnits > 0.0001) {
      await restoreInventoryLayersLifo(tx, uid, productId, needUnits);
    }
    return { restored: units, method: 'consumption', layers: restoredLayers };
  }

  await restoreInventoryLayersLifo(tx, uid, productId, units);
  return { restored: units, method: 'lifo' };
}

/** Legacy fallback when no layers exist. */
export function legacyProductCogs(product, quantity) {
  const q = Number(quantity) || 0;
  const cost = Number(product?.cost) || 0;
  return roundMoney(cost * q);
}

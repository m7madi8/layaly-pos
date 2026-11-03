const admin = require('firebase-admin');
const { roundMoney: rm } = require('./productPricing');

function roundMoney(n) {
  return rm(n);
}

function docExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists);
}

function serverTimestamp(db) {
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}

async function restoreInventoryLayersLifo(tx, db, uid, productId, quantityToRestore) {
  let need = Number(quantityToRestore) || 0;
  if (!(need > 0)) return { restored: 0, shortfall: 0 };

  const col = db.collection(`users/${uid}/inventoryLayers`);
  const snap = await tx.get(col.where('productId', '==', productId));
  const layers = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (Number(b.purchaseDateMs) || 0) - (Number(a.purchaseDateMs) || 0));

  let restored = 0;
  for (const layer of layers) {
    if (need <= 0) break;
    const initial = Number(layer.initialQuantity) || 0;
    const rem = Number(layer.remainingQuantity) || 0;
    const room = initial - rem;
    if (room <= 0.0001) continue;
    const add = Math.min(room, need);
    tx.update(layer.ref, {
      remainingQuantity: roundMoney(rem + add),
      updatedAt: serverTimestamp(db),
    });
    restored += add;
    need -= add;
  }
  return { restored, shortfall: need > 0.0001 ? need : 0 };
}

async function restoreInventoryForPartialReturn(tx, db, uid, productId, line, qtyReturned) {
  const units = Number(qtyReturned) || 0;
  if (!(units > 0)) return { restored: 0, method: 'none' };

  const consumption = Array.isArray(line?.inventoryConsumption) ? line.inventoryConsumption : [];
  if (consumption.length > 0) {
    let needUnits = units;
    for (const slice of consumption) {
      if (needUnits <= 0) break;
      const sliceQty = Number(slice.quantity) || 0;
      if (!(sliceQty > 0) || !slice.layerId) continue;
      const take = Math.min(sliceQty, needUnits);
      const layerRef = db.doc(`users/${uid}/inventoryLayers/${slice.layerId}`);
      const layerSnap = await tx.get(layerRef);
      if (!docExists(layerSnap)) continue;
      const rem = Number(layerSnap.data().remainingQuantity) || 0;
      const initial = Number(layerSnap.data().initialQuantity) || 0;
      const room = initial - rem;
      const add = Math.min(take, room > 0 ? room : take);
      tx.update(layerRef, {
        remainingQuantity: roundMoney(rem + add),
        updatedAt: serverTimestamp(db),
      });
      needUnits -= add;
    }
    if (needUnits > 0.0001) {
      await restoreInventoryLayersLifo(tx, db, uid, productId, needUnits);
    }
    return { restored: units, method: 'consumption' };
  }

  await restoreInventoryLayersLifo(tx, db, uid, productId, units);
  return { restored: units, method: 'lifo' };
}

async function consumeInventoryLayersFifo(tx, db, uid, productId, quantityNeeded) {
  let need = Number(quantityNeeded) || 0;
  if (!(need > 0)) return { cogs: 0, layers: [], shortfall: 0 };

  const col = db.collection(`users/${uid}/inventoryLayers`);
  const snap = await tx.get(col.where('productId', '==', productId));
  const layers = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((l) => (Number(l.remainingQuantity) || 0) > 0)
    .sort((a, b) => (Number(a.purchaseDateMs) || 0) - (Number(b.purchaseDateMs) || 0));

  let cogs = 0;
  const consumed = [];
  for (const layer of layers) {
    if (need <= 0) break;
    const rem = Number(layer.remainingQuantity) || 0;
    if (rem <= 0) continue;
    const take = Math.min(rem, need);
    const unit = Number(layer.unitCost) || 0;
    cogs += take * unit;
    need -= take;
    tx.update(layer.ref, {
      remainingQuantity: roundMoney(rem - take),
      updatedAt: serverTimestamp(db),
    });
    consumed.push({ layerId: layer.id, quantity: take, unitCost: unit });
  }

  if (need > 0.0001) {
    return { cogs: roundMoney(cogs), layers: consumed, shortfall: need };
  }
  return { cogs: roundMoney(cogs), layers: consumed, shortfall: 0 };
}

function legacyProductCogs(productData, units) {
  const u = Number(units) || 0;
  if (!(u > 0)) return 0;
  return roundMoney((Number(productData?.cost) || 0) * u);
}

module.exports = {
  restoreInventoryForPartialReturn,
  restoreInventoryLayersLifo,
  consumeInventoryLayersFifo,
  legacyProductCogs,
  serverTimestamp,
  roundMoney,
  docExists,
};

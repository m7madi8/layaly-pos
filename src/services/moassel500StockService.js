import { db, doc, serverTimestamp } from '../firebaseClient';
import {
  isSystemMoassel500Product,
  moasselGramsToSessionUnits,
  SYSTEM_NAKHLA_PRODUCT_ID,
  SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID,
} from '../utils/moassel500StockRouting';

export function shouldRouteMoassel500Purchase(productData, linkedProductId, products) {
  if (!linkedProductId || !productData) return false;
  const p = { id: linkedProductId, ...productData };
  if (isSystemMoassel500Product(p)) return true;
  const fromList = (products || []).find((x) => x.id === linkedProductId);
  return fromList ? isSystemMoassel500Product(fromList) : false;
}

/**
 * @param {number} gramsDelta — موجب للإضافة، سالب للخصم
 */
export async function applyMoassel500StockDeltaInTransaction(
  tx,
  uid,
  { gramsDelta, nakhlaId, renewalId }
) {
  const units = moasselGramsToSessionUnits(Math.abs(Number(gramsDelta) || 0));
  if (!(units > 0)) return { units: 0 };

  const nId = nakhlaId || SYSTEM_NAKHLA_PRODUCT_ID;
  const rId = renewalId || SYSTEM_NAKHLA_RENEWAL_PRODUCT_ID;
  const nRef = doc(db, 'users', uid, 'products', nId);
  const rRef = doc(db, 'users', uid, 'products', rId);
  const nSnap = await tx.get(nRef);
  const rSnap = await tx.get(rRef);
  if (!nSnap.exists() || !rSnap.exists()) {
    throw new Error('أصناف «نخلة» و«تجديد نخلة» غير موجودة — شغّل التطبيق كمدير لإنشاء الأصناف النظامية');
  }

  const sign = Number(gramsDelta) < 0 ? -1 : 1;
  const delta = sign * units;
  const nStock = Math.max(0, (Number(nSnap.data().stock) || 0) + delta);
  const rStock = Math.max(0, (Number(rSnap.data().stock) || 0) + delta);
  const ts = serverTimestamp();
  tx.update(nRef, { stock: nStock, updatedAt: ts });
  tx.update(rRef, { stock: rStock, updatedAt: ts });
  return { units, nakhlaId: nId, renewalId: rId };
}

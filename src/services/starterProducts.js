import { db, doc, collection, addDoc, getDocs, query, updateDoc, serverTimestamp } from '../firebaseClient';
import { getProductType } from '../utils/productPricing';

/** أصناف أساسية تُضاف مرة واحدة فقط لكل حساب، ولا تُعاد إذا حذفها المدير لاحقاً */
const STARTER_FLAG = 'starterProductsV1';

const STARTER_PRODUCTS = [
  {
    type: 'weight',
    data: {
      name: 'معسل',
      category: 'الأرجيل',
      productType: 'weight',
      weightPricing: { unit: 'g', baseWeight: 2, basePrice: 1, pricePerUnit: 0.5 },
      price: 1,
      cost: 0,
      stock: 0,
      addOns: [],
      ingredients: [],
      image: '',
    },
  },
  {
    type: 'time',
    data: {
      name: 'بلايستيشن',
      category: 'البلايستيشن',
      productType: 'time',
      timePricing: { billingMinutes: 15, billingPrice: 3, rounding: 'up' },
      price: 3,
      cost: 0,
      stock: null,
      addOns: [],
      ingredients: [],
      image: '',
    },
  },
];

export async function ensureStarterProducts(uid, profile) {
  if (!uid || !profile || profile[STARTER_FLAG]) return false;
  const snap = await getDocs(query(collection(db, 'users', uid, 'products')));
  const existingTypes = new Set(snap.docs.map((d) => getProductType(d.data())));
  for (const starter of STARTER_PRODUCTS) {
    if (existingTypes.has(starter.type)) continue;
    await addDoc(collection(db, 'users', uid, 'products'), {
      ...starter.data,
      userId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await updateDoc(doc(db, 'users', uid), { [STARTER_FLAG]: true });
  return true;
}

const ASSETS_FLAG = 'starterAssetsV1';
const STARTER_HOOKAH_COUNT = 5;

/** خمس أراجيل متاحة للخروج — تُنشأ مرة واحدة فقط وإذا لم تكن هناك أراجيل مسجلة */
export async function ensureStarterAssets(uid, profile) {
  if (!uid || !profile || profile[ASSETS_FLAG]) return false;
  const snap = await getDocs(query(collection(db, 'users', uid, 'externalAssets')));
  if (snap.docs.length === 0) {
    for (let n = 1; n <= STARTER_HOOKAH_COUNT; n += 1) {
      await addDoc(collection(db, 'users', uid, 'externalAssets'), {
        name: `أرجيلة #${n}`,
        code: String(n),
        type: 'shisha',
        notes: '',
        status: 'available',
        currentMovementId: null,
        createdAt: serverTimestamp(),
      });
    }
  }
  await updateDoc(doc(db, 'users', uid), { [ASSETS_FLAG]: true });
  return true;
}

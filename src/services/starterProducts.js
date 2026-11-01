import { db, doc, collection, addDoc, getDocs, getDoc, setDoc, query, updateDoc, serverTimestamp } from '../firebaseClient';
import { getProductType } from '../utils/productPricing';
import {
  SYSTEM_SERVICE_PRODUCT_ID,
  isSystemServiceProduct,
  buildSystemServiceProduct,
} from '../productAssets';

/** أصناف أساسية تُضاف مرة واحدة فقط لكل حساب، ولا تُعاد إذا حذفها المدير لاحقاً */
const STARTER_FLAG = 'starterProductsV1';
const TOBACCO_IMAGE = `${process.env.PUBLIC_URL || ''}/products/tobacco.webp`;
const TOBACCO_IMAGE_FLAG = 'tobaccoImageV1';

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
      image: TOBACCO_IMAGE,
    },
  },
  {
    type: 'time',
    data: {
      name: 'بلايستيشن',
      category: 'البلايستيشن',
      productType: 'time',
      timePricing: { billingMinutes: 5, billingPrice: 1, rounding: 'up' },
      price: 1,
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

/** صورة المعسل لأصناف الوزن الموجودة بدون صورة — مرة واحدة ولا تستبدل صورة اختارها المدير */
export async function ensureTobaccoImage(uid, profile) {
  if (!uid || !profile || profile[TOBACCO_IMAGE_FLAG]) return false;
  const snap = await getDocs(query(collection(db, 'users', uid, 'products')));
  for (const d of snap.docs) {
    const p = d.data();
    if (getProductType(p) === 'weight' && String(p.name || '').includes('معسل') && !p.image) {
      await updateDoc(doc(db, 'users', uid, 'products', d.id), { image: TOBACCO_IMAGE, updatedAt: serverTimestamp() });
    }
  }
  await updateDoc(doc(db, 'users', uid), { [TOBACCO_IMAGE_FLAG]: true });
  return true;
}

const PS_PRICING_FLAG = 'playstationPricing5minV1';

/** تسعير البلايستيشن: 1₪ لكل 5 دقائق — يحدّث صنف الوقت القديم (3₪/15د) مرة واحدة فقط */
export async function ensurePlaystationPricing(uid, profile) {
  if (!uid || !profile || profile[PS_PRICING_FLAG]) return false;
  const snap = await getDocs(query(collection(db, 'users', uid, 'products')));
  for (const d of snap.docs) {
    const p = d.data();
    const tp = p.timePricing || {};
    if (getProductType(p) === 'time' && Number(tp.billingMinutes) === 15 && Number(tp.billingPrice) === 3) {
      await updateDoc(doc(db, 'users', uid, 'products', d.id), {
        timePricing: { ...tp, billingMinutes: 5, billingPrice: 1 },
        price: 1,
        updatedAt: serverTimestamp(),
      });
    }
  }
  await updateDoc(doc(db, 'users', uid), { [PS_PRICING_FLAG]: true });
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

/** صنف «خدمات» ثابت — معرّف ثابت system-service */
export async function ensureSystemServiceProduct(uid) {
  if (!uid) return { created: false, id: SYSTEM_SERVICE_PRODUCT_ID };

  const fixedRef = doc(db, 'users', uid, 'products', SYSTEM_SERVICE_PRODUCT_ID);
  const fixedSnap = await getDoc(fixedRef);
  if (fixedSnap.exists()) {
    return { created: false, id: fixedSnap.id };
  }

  const snap = await getDocs(collection(db, 'users', uid, 'products'));
  const legacy = snap.docs.find((d) => isSystemServiceProduct({ id: d.id, ...d.data() }));
  if (legacy) {
    return { created: false, id: legacy.id };
  }

  const payload = {
    ...buildSystemServiceProduct(uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  delete payload.id;

  await setDoc(fixedRef, payload);
  return { created: true, id: SYSTEM_SERVICE_PRODUCT_ID };
}

export async function loadSystemServiceProduct(uid) {
  if (!uid) return null;
  const fixedRef = doc(db, 'users', uid, 'products', SYSTEM_SERVICE_PRODUCT_ID);
  const fixedSnap = await getDoc(fixedRef);
  if (fixedSnap.exists()) {
    return { id: fixedSnap.id, ...fixedSnap.data() };
  }
  const snap = await getDocs(collection(db, 'users', uid, 'products'));
  const legacy = snap.docs.find((d) => isSystemServiceProduct({ id: d.id, ...d.data() }));
  if (legacy) return { id: legacy.id, ...legacy.data() };
  return null;
}

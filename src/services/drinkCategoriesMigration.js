import { db, doc, collection, getDocs, query, updateDoc, serverTimestamp } from '../firebaseClient';
import {
  LEGACY_DRINKS_CATEGORY,
  classifyDrinkCategory,
} from '../productAssets';

const DRINKS_SPLIT_FLAG = 'drinksSplitColdHotV1';

/** مرة واحدة: تقسيم «المشروبات» إلى مشروبات باردة / ساخنة */
export async function ensureDrinkCategoriesSplit(uid, profile) {
  if (!uid || !profile || profile[DRINKS_SPLIT_FLAG]) return false;

  const snap = await getDocs(query(collection(db, 'users', uid, 'products')));
  for (const d of snap.docs) {
    const p = d.data();
    const cat = String(p.category || '').trim();
    if (cat !== LEGACY_DRINKS_CATEGORY) continue;
    const next = classifyDrinkCategory(p.name, cat);
    if (next === cat) continue;
    await updateDoc(doc(db, 'users', uid, 'products', d.id), {
      category: next,
      updatedAt: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, 'users', uid), { [DRINKS_SPLIT_FLAG]: true });
  return true;
}

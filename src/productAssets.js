/** مسار صور ثابتة (اختياري) من public/منتجات */
const BASE = `${process.env.PUBLIC_URL || ''}/منتجات`;

export function productImageUrl(fileName) {
  return `${BASE}/${encodeURI(fileName)}`;
}

/** أقسام افتراضية — يمكن إضافة أقسام جديدة عند تعريف المنتج */
export const MENU_CATEGORIES = ['الأرجيل', 'المشروبات', 'النثريات'];

/** @deprecated استخدم buildPosMenuTabs(mergeMenuCategories(...)) */
export const POS_MENU_TABS = [
  { id: 'all', label: 'الكل' },
  ...MENU_CATEGORIES.map((c) => ({ id: c, label: c })),
];

/** دمج الأقسام الافتراضية مع أقسام المنتجات الحالية */
export function mergeMenuCategories(products = []) {
  const fromProducts = products.map((p) => (p.category || '').trim()).filter(Boolean);
  const merged = new Set([...MENU_CATEGORIES, ...fromProducts]);
  return [...merged].sort((a, b) => a.localeCompare(b, 'ar'));
}

export function buildPosMenuTabs(categoryList) {
  return [{ id: 'all', label: 'الكل' }, ...categoryList.map((c) => ({ id: c, label: c }))];
}

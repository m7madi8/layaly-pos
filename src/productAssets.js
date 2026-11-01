/** مسار صور ثابتة (اختياري) من public/منتجات */
const BASE = `${process.env.PUBLIC_URL || ''}/منتجات`;

export function productImageUrl(fileName) {
  return `${BASE}/${encodeURI(fileName)}`;
}

export const LEGACY_DRINKS_CATEGORY = 'المشروبات';
export const DRINK_COLD_CATEGORY = 'مشروبات باردة';
export const DRINK_HOT_CATEGORY = 'مشروبات ساخنة';
/** صنف نظامي — سعر البيع يُدخل يدوياً عند كل إضافة */
export const SERVICES_CATEGORY = 'خدمات';
export const SYSTEM_SERVICE_PRODUCT_ID = 'system-service';

/** أقسام افتراضية — يمكن إضافة أقسام جديدة عند تعريف المنتج */
export const MENU_CATEGORIES = ['الأرجيل', 'مشروبات باردة', SERVICES_CATEGORY, 'مشروبات ساخنة', 'النثريات'];

/** ترتيب تبويبات POS — «خدمات» بعد مشروبات باردة */
const POS_TAB_ORDER = ['الأرجيل', DRINK_COLD_CATEGORY, SERVICES_CATEGORY, DRINK_HOT_CATEGORY, 'النثريات'];

const HOT_DRINK_NAME_RE =
  /قهوة|اسبريسو|إسبريسو|espresso|لاتيه|latte|كابتش|cappuccino|شاي|tea|ساخن|hot|موكا|mocha|أمريكانو|americano|تركي|نقعه|كورتادو|flat\s*white/i;
const COLD_DRINK_NAME_RE =
  /عصير|juice|مثلج|iced|\bice\b|بارد|cold|سموذي|smoothie|فلاي|fly|ماكس|max|غازي|كولا|pepsi|موهيتو|ليمون|فراب|frapp|ميرندا|سفن|sprite|energy/i;

/** تصنيف مشروب قديم (المشروبات) إلى بارد / ساخن */
export function classifyDrinkCategory(productName, currentCategory) {
  const cat = String(currentCategory || '').trim();
  if (cat === DRINK_COLD_CATEGORY || cat === DRINK_HOT_CATEGORY) return cat;
  if (cat !== LEGACY_DRINKS_CATEGORY) return cat;
  const name = String(productName || '');
  const cold = COLD_DRINK_NAME_RE.test(name);
  const hot = HOT_DRINK_NAME_RE.test(name);
  if (cold && !hot) return DRINK_COLD_CATEGORY;
  if (hot && !cold) return DRINK_HOT_CATEGORY;
  if (cold && hot) return DRINK_COLD_CATEGORY;
  return DRINK_COLD_CATEGORY;
}

/** صورة أوضح لأصناف محددة (مثل ماكس فلاي) */
export function isBoostedProductImage(productName) {
  return /ماكس\s*فلاي|max\s*fly/i.test(String(productName || ''));
}

/** @deprecated استخدم buildPosMenuTabs(mergeMenuCategories(...)) */
export const POS_MENU_TABS = [
  { id: 'all', label: 'الكل' },
  ...MENU_CATEGORIES.map((c) => ({ id: c, label: c })),
];

/** دمج الأقسام الافتراضية مع أقسام المنتجات الحالية — «خدمات» دائماً في POS */
export function mergeMenuCategories(products = []) {
  const fromProducts = products.map((p) => (p.category || '').trim()).filter(Boolean);
  const normalized = fromProducts.map((c) => (c === LEGACY_DRINKS_CATEGORY ? DRINK_COLD_CATEGORY : c));
  const merged = new Set([...MENU_CATEGORIES, SERVICES_CATEGORY, ...normalized]);
  merged.delete(LEGACY_DRINKS_CATEGORY);
  return [...merged].sort((a, b) => a.localeCompare(b, 'ar'));
}

export function isSystemServiceProduct(product) {
  if (!product) return false;
  if (product.systemService) return true;
  return (
    String(product.name || '').trim() === 'خدمات' &&
    String(product.category || '').trim() === SERVICES_CATEGORY
  );
}

export function buildSystemServiceProduct(uid) {
  return {
    id: SYSTEM_SERVICE_PRODUCT_ID,
    name: 'خدمات',
    category: SERVICES_CATEGORY,
    productType: 'service',
    price: 0,
    cost: 0,
    stock: null,
    addOns: [],
    ingredients: [],
    image: '',
    systemService: true,
    userId: uid,
  };
}

export function buildPosMenuTabs(categoryList) {
  const remaining = new Set([...categoryList, SERVICES_CATEGORY]);
  const ordered = [];
  for (const id of POS_TAB_ORDER) {
    if (remaining.has(id)) {
      ordered.push({ id, label: id });
      remaining.delete(id);
    }
  }
  const rest = [...remaining].sort((a, b) => a.localeCompare(b, 'ar'));
  return [{ id: 'all', label: 'الكل' }, ...ordered, ...rest.map((c) => ({ id: c, label: c }))];
}

import { resolveEmployeeLoginPassword } from './config/authSecrets';

/** بريد الدخول — يجب أن يطابق مستخدم Firebase Authentication */
export const ADMIN_LOGIN_EMAIL =
  (process.env.REACT_APP_ADMIN_EMAIL || 'admin@layali.cafe').trim();

/** كلمة مرور شاشة الموظف — في الإنتاج يجب ضبط REACT_APP_EMPLOYEE_PASSWORD (لا افتراضي في البناء) */
export function getEmployeeLoginPassword() {
  return resolveEmployeeLoginPassword();
}

/** الصفحات المسموحة للموظف */
export const EMPLOYEE_VIEWS = ['pos', 'customers', 'cash', 'expenses', 'purchases', 'traders', 'orders'];

/** إضافة وتعديل عميل — مسموح للمدير والموظف */
export function canCreateCustomers(role) {
  return role === 'admin' || role === 'employee';
}

export function canEditCustomers(role) {
  return canCreateCustomers(role);
}

/** فتح وتعديل الفواتير المعلقة — مسموح للمدير والموظف */
export function canManageOpenBills(role) {
  return role === 'admin' || role === 'employee';
}

/** تعديل الطلبات المحفوظة — مسموح للمدير والموظف */
export function canEditOrders(role) {
  return role === 'admin' || role === 'employee';
}

/** حذف الطلبات من السجل — مدير فقط (استخدم الإلغاء لاسترجاع المخزون) */
export function canDeleteOrders(role) {
  return role === 'admin';
}

export function isFinanceRole(role) {
  return role === 'admin' || role === 'employee';
}

/** إدارة ملفات التجار (إضافة / تعديل / رصيد افتتاحي / أرشفة) — مدير وموظف */
export function canManageMerchantProfiles(role) {
  return role === 'admin' || role === 'employee';
}

const ROLE_KEY = 'layali-user-role';

/** @deprecated UI hint only — authorization comes from Firestore tenant membership. */
export function readSessionRole() {
  return null;
}

/** @deprecated Do not use for authorization. */
export function saveSessionRole(_role) {
  try {
    localStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

/** يزيل رموز الاتجاه المخفية التي تضيفها لوحات المفاتيح في الصفحات العربية */
export function normalizeLoginPassword(value) {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .trim();
}

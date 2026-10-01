/** بريد الدخول — يجب أن يطابق مستخدم Firebase Authentication */
export const ADMIN_LOGIN_EMAIL =
  (process.env.REACT_APP_ADMIN_EMAIL || 'admin@layali.cafe').trim();

/** كلمة مرور شاشة الموظف — مستقلة عن كلمة مرور المدير على Firebase */
export const EMPLOYEE_LOGIN_PASSWORD =
  (process.env.REACT_APP_EMPLOYEE_PASSWORD || 'admin123').trim();

/** الصفحات المسموحة للموظف */
export const EMPLOYEE_VIEWS = ['pos'];

const ROLE_KEY = 'layali-user-role';

/** الدور محفوظ على الجهاز (localStorage) ليبقى الدخول بعد التحديث أو إغلاق التطبيق، حتى تسجيل الخروج */
export function readSessionRole() {
  let role = null;
  try {
    role = localStorage.getItem(ROLE_KEY) || sessionStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
  return role === 'admin' || role === 'employee' ? role : null;
}

export function saveSessionRole(role) {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  } catch {
    /* storage unavailable (private mode) — role lasts for this page only */
  }
}

/** يزيل رموز الاتجاه المخفية التي تضيفها لوحات المفاتيح في الصفحات العربية */
export function normalizeLoginPassword(value) {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .trim();
}

/** بريد الدخول — يجب أن يطابق مستخدم Firebase Authentication */
export const ADMIN_LOGIN_EMAIL =
  (process.env.REACT_APP_ADMIN_EMAIL || 'admin@layali.cafe').trim();

/** كلمة مرور شاشة الموظف — مستقلة عن كلمة مرور المدير على Firebase */
export const EMPLOYEE_LOGIN_PASSWORD =
  (process.env.REACT_APP_EMPLOYEE_PASSWORD || 'admin123').trim();

/** الصفحات المسموحة للموظف */
export const EMPLOYEE_VIEWS = ['pos'];

const ROLE_KEY = 'layali-user-role';

export function readSessionRole() {
  const role = sessionStorage.getItem(ROLE_KEY);
  return role === 'admin' || role === 'employee' ? role : null;
}

export function saveSessionRole(role) {
  if (role) sessionStorage.setItem(ROLE_KEY, role);
  else sessionStorage.removeItem(ROLE_KEY);
}

/** يزيل رموز الاتجاه المخفية التي تضيفها لوحات المفاتيح في الصفحات العربية */
export function normalizeLoginPassword(value) {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .trim();
}

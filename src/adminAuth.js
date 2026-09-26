/** كلمة مرور الدخول للنظام (تظهر في حزمة الواجهة — للاستخدام الداخلي فقط) */
export const ADMIN_PASSWORD =
  process.env.REACT_APP_ADMIN_PASSWORD || 'adminlayaly123';

export const ADMIN_LOGIN_EMAIL =
  process.env.REACT_APP_ADMIN_EMAIL || 'admin@layali.cafe';

export function isAdminPasswordValid(password) {
  return String(password) === ADMIN_PASSWORD;
}

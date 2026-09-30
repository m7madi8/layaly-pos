/** رسائل دخول آمنة للمستخدم — بدون تسريب تفاصيل Firebase */
export function mapFirebaseAuthError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'كلمة المرور غير صحيحة';
    case 'auth/user-not-found':
      return 'الحساب غير موجود. أنشئ المستخدم في Firebase Authentication.';
    case 'auth/too-many-requests':
      return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
    case 'auth/network-request-failed':
      return 'تحقق من اتصال الإنترنت وحاول مرة أخرى.';
    case 'auth/user-disabled':
      return 'هذا الحساب معطّل.';
    default:
      return 'تعذّر تسجيل الدخول. تحقق من كلمة المرور والاتصال.';
  }
}

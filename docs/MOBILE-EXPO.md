# تطبيق الهاتف — Expo

مجلد **`mobile/`** يغلّف نفس نظام الويب (Vercel) داخل تطبيق Expo.  
**لا يعيد كتابة** واجهة POS — يفتح الموقع المنشور داخل WebView (مناسب للمقهى: Firebase، real-time، PDF، كما في المتصفح).

## المتطلبات

- Node.js
- تطبيق **Expo Go** على الهاتف (للتجربة)
- حساب [Expo](https://expo.dev) لبناء APK/AAB (Android) أو IPA (iOS)

## التشغيل للتجربة

```bash
cd mobile
copy .env.example .env
# عدّل EXPO_PUBLIC_APP_URL إن لزم
npm start
```

امسح QR من **Expo Go** (Android/iOS).

## عنوان الموقع

| البيئة | EXPO_PUBLIC_APP_URL |
|--------|---------------------|
| إنتاج | `https://layaly-pos.vercel.app` (أو دومينك) |
| محلي | `http://IP-الكمبيوتر:3000` — نفس Wi‑Fi |

يجب أن يكون الموقع على Vercel **مربوط Firebase** (ليس وضع demo).

## بناء تطبيق للتثبيت (Android)

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

ملف **APK** للتوزيع الداخلي، أو **AAB** لـ Google Play.

## iOS

يتطلب **Mac** + Apple Developer. استخدم `eas build -p ios`.

## ملاحظات

- **Bluetooth للطباعة:** يعتمد على WebView/Android Chrome — قد لا يعمل على iOS؛ استخدم طباعة PDF من المتصفح داخل التطبيق.
- **أيقونة التطبيق:** استبدل ملفات `mobile/assets/icon.png` و `android-icon-*.png` بشعار المقهى.
- **تطبيق native كامل** (بدون WebView) يتطلب إعادة بناء الواجهة بـ React Native — مشروع منفصل كبير.

## هيكل

```
mobile/
  App.tsx          ← WebView + شاشة تحميل/خطأ
  app.config.js    ← اسم عربي، ألوان، appUrl
  .env.example
```

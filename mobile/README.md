# تطبيق ليالي كافيه (Expo)

التطبيق **غلاف WebView** يفتح نفس نظام الويب المنشور على Vercel (`EXPO_PUBLIC_APP_URL`، الافتراضي `https://layaly-pos.vercel.app`).

## تزامن الميزات مع الويب

| المنصة | مصدر الواجهة |
|--------|----------------|
| المتصفح / Vercel | بناء React (`npm run build`) |
| Android / iOS | نفس الموقع داخل WebView — **لا كود منفصل للتجار أو المصروفات** |

بعد كل نشر على Vercel، حدّث التطبيق بسحب الصفحة للتحديث (Android) أو أغلق وافتح التطبيق. إن ظهرت نسخة قديمة: امسح بيانات التطبيق أو انتظر اكتمال النشر على Vercel.

## التطوير المحلي

```bash
cd mobile
cp .env.example .env
npx expo start
```

ضع `EXPO_PUBLIC_APP_URL` على `http://<IP>:3000` عند تشغيل `npm start` من جذر المشروع.

import React from 'react';
import { resolveAppLogo, APP_NAME, FONT_UI, theme } from '../branding';

export default function CloudConfigRequired({ missingKeys = [] }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 font-cairo"
      style={{ backgroundColor: theme.bgWarm }}
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 border border-red-100">
        <div className="text-center mb-6">
          <img src={resolveAppLogo()} alt="" className="w-20 h-20 mx-auto mb-4 rounded-2xl object-contain bg-white p-1" />
          <h1 className="text-xl font-semibold text-primary" style={{ fontFamily: FONT_UI }}>
            {APP_NAME}
          </h1>
          <p className="text-sm text-red-700 mt-3 leading-relaxed" style={{ fontFamily: FONT_UI }}>
            النظام غير جاهز للعمل: إعدادات السحابة (Firebase) غير مكتملة على هذا الخادم.
            البيانات <strong>لن تُحفظ</strong> حتى يتم ضبط المتغيرات وإعادة النشر.
          </p>
        </div>
        {missingKeys.length > 0 && (
          <div className="text-xs bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
            <p className="font-medium text-gray-700 mb-2" style={{ fontFamily: FONT_UI }}>
              متغيرات ناقصة عند آخر بناء:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1 font-mono text-[11px]">
              {missingKeys.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-gray-500 leading-relaxed" style={{ fontFamily: FONT_UI }}>
          على Vercel: Settings → Environment Variables → أضف كل المتغيرات من{' '}
          <code className="bg-gray-100 px-1 rounded">.env.example</code> ثم <strong>Redeploy</strong>.
          محلياً: انسخ إلى <code className="bg-gray-100 px-1 rounded">.env.local</code> وأعد تشغيل{' '}
          <code className="bg-gray-100 px-1 rounded">npm start</code>.
        </p>
      </div>
    </div>
  );
}

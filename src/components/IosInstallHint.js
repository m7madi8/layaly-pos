import React, { useState } from 'react';
import { X } from 'lucide-react';
import { APP_NAME, FONT_UI } from '../branding';

const DISMISS_KEY = 'layali-ios-install-dismissed';

function detectIos() {
  if (typeof window === 'undefined') return { isIos: false };
  const ua = window.navigator.userAgent || '';
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  const isOtherBrowser = /crios|fxios|edgios|opios/i.test(ua);
  return { isIos, isStandalone, isOtherBrowser };
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-[-3px]">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
    </svg>
  );
}

/** دليل تثبيت التطبيق على الشاشة الرئيسية للآيفون — يظهر فقط في متصفح iOS خارج وضع التطبيق */
export default function IosInstallHint() {
  const [env] = useState(detectIos);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  if (!env.isIos || env.isStandalone || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      className="relative mt-4 rounded-2xl border border-accent/25 bg-white p-4 text-start shadow-sm"
      style={{ fontFamily: FONT_UI }}
      role="note"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className="absolute top-2 end-2 grid h-8 w-8 place-items-center rounded-full text-gray-400 hover:bg-gray-100"
      >
        <X size={16} />
      </button>
      <p className="mb-2 pe-8 text-sm font-semibold text-primary">ثبّت {APP_NAME} على الآيفون</p>
      {env.isOtherBrowser ? (
        <p className="text-xs leading-relaxed text-gray-600">
          افتح هذه الصفحة في متصفح <strong>Safari</strong>، ثم ثبّت التطبيق من زر المشاركة. التثبيت على الآيفون يعمل من Safari فقط.
        </p>
      ) : (
        <ol className="list-inside list-decimal space-y-1.5 text-xs leading-relaxed text-gray-600">
          <li>
            اضغط زر المشاركة <span className="text-accent"><ShareIcon /></span> أسفل الشاشة
          </li>
          <li>
            اختر <strong>إضافة إلى الشاشة الرئيسية</strong>
          </li>
          <li>
            اضغط <strong>إضافة</strong> — يظهر التطبيق بين تطبيقاتك ويفتح بملء الشاشة
          </li>
        </ol>
      )}
    </div>
  );
}

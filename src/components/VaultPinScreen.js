import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, Delete } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { isVaultPinValid, VAULT_PIN } from '../vaultAuth';

const PIN_LENGTH = VAULT_PIN.length;

export default function VaultPinScreen({ theme, onUnlocked }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const clearErrorSoon = useCallback(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(false), 600);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => clearErrorSoon(), [clearErrorSoon]);

  const trySubmit = useCallback(
    (value) => {
      if (value.length < PIN_LENGTH) return;
      if (isVaultPinValid(value)) {
        setDigits('');
        setError(false);
        onUnlocked();
        return;
      }
      setError(true);
      setShake(true);
      setDigits('');
      setTimeout(() => setShake(false), 450);
    },
    [onUnlocked]
  );

  const pushDigit = (d) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => trySubmit(next), 120);
    }
  };

  const backspace = () => {
    setDigits((prev) => prev.slice(0, -1));
    setError(false);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <div className="max-w-sm mx-auto py-8 px-4" dir="rtl">
      <div className="text-center mb-8">
        <span
          className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-white mb-4 shadow-md"
          style={{ backgroundColor: theme.primary }}
        >
          <Landmark size={26} />
        </span>
        <h2 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>
          الخزنة
        </h2>
        <p className="text-sm text-gray-500 mt-1" style={{ fontFamily: FONT_UI }}>
          أدخل رمز الدخول ({PIN_LENGTH} أرقام)
        </p>
      </div>

      <div
        className={`flex justify-center gap-3 mb-2 ${shake ? 'layali-pin-shake' : ''}`}
        aria-live="polite"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < digits.length
                ? 'bg-primary border-primary'
                : error
                  ? 'border-red-400 bg-red-50'
                  : 'border-gray-300 bg-white'
            }`}
          />
        ))}
      </div>
      {error && (
        <p className="text-center text-sm text-red-600 mb-6" style={{ fontFamily: FONT_UI }}>
          الرمز غير صحيح — حاول مرة أخرى
        </p>
      )}
      {!error && <div className="mb-6" />}

      <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
        {keys.map((key, idx) => {
          if (key === '') {
            return <div key={`sp-${idx}`} />;
          }
          if (key === 'back') {
            return (
              <button
                key="back"
                type="button"
                onClick={backspace}
                className="h-14 rounded-2xl flex items-center justify-center text-gray-600 active:bg-gray-100 border border-gray-200"
                aria-label="حذف"
              >
                <Delete size={22} />
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => pushDigit(key)}
              className="h-14 rounded-2xl text-xl font-semibold text-primary bg-white border border-gray-200 shadow-sm active:bg-[var(--color-bg-warm)] active:scale-[0.98] transition-transform"
              style={{ fontFamily: FONT_UI }}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

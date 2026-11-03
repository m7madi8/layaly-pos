import { useEffect, useRef } from 'react';
import { isAfterCashDayStart } from '../utils/cashDayGate';

const STORAGE_KEY = 'layali-shift2-warn-at';

/** Warn every 5 minutes if shift 2 still open after noon next cash day. */
export function useShiftOverdueWarning({ openShift, fmtAlert }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const tick = () => {
      if (!openShift || Number(openShift.shiftPeriod) !== 2) return;
      const openedMs = Number(openShift.openedAtMs) || 0;
      if (!openedMs) return;
      const now = new Date();
      if (!isAfterCashDayStart(now)) return;
      const openedDay = new Date(openedMs);
      if (now.toDateString() === openedDay.toDateString()) return;

      const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
      if (Date.now() - last < 5 * 60 * 1000) return;
      sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      const msg =
        fmtAlert ||
        'الشفت الثاني ما زال مفتوحاً بعد 12 ظهراً — يُفضّل إغلاقه لتسكير يوم العمل.';
      if (typeof window !== 'undefined') window.alert(msg);
    };

    tick();
    timerRef.current = setInterval(tick, 60 * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [openShift, fmtAlert]);
}

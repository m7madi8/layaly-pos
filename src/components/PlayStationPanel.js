import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Play, Square, Plus, X } from 'lucide-react';
import { FONT_UI } from '../branding';
import { durationMinutesBetween, timePrice } from '../utils/productPricing';

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * لوحة أجهزة البلايستيشن داخل نقطة البيع — مؤقت مستقل لكل جهاز.
 */
export default function PlayStationPanel({
  stations,
  sessions,
  timeProducts,
  fmtMoney,
  busy,
  onStart,
  onEnd,
  onCancel,
  onAddEndedToCart,
  cartSessionIds,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pickingStationId, setPickingStationId] = useState(null);

  const activeByStation = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      if (s.status === 'active') map[s.stationId] = s;
    });
    return map;
  }, [sessions]);

  const unbilledEnded = useMemo(
    () => sessions.filter((s) => s.status === 'ended' && !s.billed && !cartSessionIds.has(s.id)),
    [sessions, cartSessionIds]
  );

  const hasActive = Object.keys(activeByStation).length > 0;
  useEffect(() => {
    if (!hasActive) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActive]);

  if (timeProducts.length === 0) return null;

  const start = (station, product) => {
    setPickingStationId(null);
    onStart(station, product);
  };

  return (
    <section className="mb-4" style={{ fontFamily: FONT_UI }} aria-label="أجهزة البلايستيشن">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-primary">
        <Gamepad2 size={18} />
        البلايستيشن
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {stations.map((station) => {
          const session = activeByStation[station.id];
          if (session) {
            const elapsedMs = now - session.startedAtMs;
            const estimate = timePrice(
              { billingMinutes: session.billingMinutes, billingPrice: session.billingPrice, rounding: session.rounding },
              durationMinutesBetween(session.startedAtMs, now)
            );
            return (
              <div key={station.id} className="rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{station.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {session.productName}
                      {session.customerName ? ` · ${session.customerName}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-white bg-accent rounded-full px-2 py-0.5 shrink-0">يعمل</span>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-xl font-bold tabular-nums text-primary" dir="ltr">{formatClock(elapsedMs)}</span>
                  <span className="text-sm font-semibold text-accent">{fmtMoney(estimate)}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEnd(session)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
                  >
                    <Square size={13} />
                    إنهاء وإضافة للطلب
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancel(session)}
                    className="px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                    title="إلغاء جلسة بدأت بالخطأ"
                    aria-label="إلغاء الجلسة"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          }

          const picking = pickingStationId === station.id;
          return (
            <div key={station.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary">{station.name}</p>
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">متاح</span>
              </div>
              {picking ? (
                <div className="mt-2 space-y-1.5">
                  {timeProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={busy}
                      onClick={() => start(station, p)}
                      className="w-full text-start text-xs px-2.5 py-2 rounded-lg border border-gray-200 hover:border-accent hover:bg-accent-soft/30 disabled:opacity-50"
                    >
                      {p.name} — {fmtMoney(p.timePricing?.billingPrice || 0)} / {p.timePricing?.billingMinutes} د
                    </button>
                  ))}
                  <button type="button" onClick={() => setPickingStationId(null)} className="w-full text-[11px] text-gray-400 py-1">
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (timeProducts.length === 1 ? start(station, timeProducts[0]) : setPickingStationId(station.id))}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-primary/20 text-primary text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  <Play size={13} />
                  بدء جلسة
                </button>
              )}
            </div>
          );
        })}
      </div>

      {unbilledEnded.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-medium text-amber-900 mb-1.5">جلسات منتهية لم تُضف لأي طلب</p>
          <div className="flex flex-wrap gap-1.5">
            {unbilledEnded.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onAddEndedToCart(s)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
              >
                <Plus size={12} />
                {s.stationName} · {Math.round(s.durationMinutes || 0)} د · {fmtMoney(s.price || 0)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

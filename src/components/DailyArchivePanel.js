import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { FONT_HEADING, FONT_UI } from '../branding';
import { listBusinessDaySummaries } from '../services/businessDayService';

export default function DailyArchivePanel({ uid, fmtMoney }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    listBusinessDaySummaries(uid)
      .then(setDays)
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [uid]);

  return (
    <div className="mt-8 layali-card p-5">
      <h3 className="text-lg font-bold text-primary mb-3 flex items-center gap-2" style={{ fontFamily: FONT_HEADING }}>
        <CalendarDays size={18} /> أرشيف أيام العمل
      </h3>
      {loading && <p className="text-sm text-gray-500">جاري التحميل…</p>}
      {!loading && days.length === 0 && (
        <p className="text-sm text-gray-500">لا أيام م archived بعد — يُنشأ الأرشيف عند إغلاق الشفت الثاني.</p>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelected(d)}
            className="text-start p-4 rounded-xl border border-gray-200 hover:border-primary/40 bg-white"
          >
            <p className="font-semibold text-primary text-sm">{d.businessDayKey || d.id}</p>
            <p className="text-xs text-gray-500 mt-1">
              {d.closedAtMs ? new Date(d.closedAtMs).toLocaleString('ar') : '—'}
            </p>
            {d.totalSales != null && (
              <p className="text-xs mt-2">مبيعات: {fmtMoney(d.totalSales)}</p>
            )}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 p-4 rounded-xl bg-[var(--color-bg-warm)] text-sm space-y-1" style={{ fontFamily: FONT_UI }}>
          <p className="font-bold text-primary">تفاصيل اليوم</p>
          <pre className="text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(selected, null, 2)}</pre>
          <button type="button" className="text-primary text-xs underline" onClick={() => setSelected(null)}>
            إغلاق
          </button>
        </div>
      )}
    </div>
  );
}

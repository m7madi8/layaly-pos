/**
 * معاينة جلسات البلايستيشن المرشّحة للتنظيف (بدون حذف بالعمر وحده).
 */

export function sessionCleanupBlockReason(session, orderIdSet) {
  if (!session) return 'missing';
  if (session.status === 'active') return 'active';
  if (session.billed && session.orderId && orderIdSet.has(session.orderId) && session.isTestData !== true) {
    return 'billed_live_order';
  }
  return null;
}

export function isSessionRecommendedForCleanup(session) {
  if (!session || session.status === 'active') return false;
  if (session.isTestData === true) return true;
  if (session.status === 'cancelled') return true;
  if (session.status === 'ended' && !session.billed) return true;
  return false;
}

export function buildPlaystationCleanupPreview(sessions, orders = []) {
  const orderIdSet = new Set((orders || []).map((o) => o.id));
  const rows = (sessions || [])
    .filter((s) => s.status !== 'active')
    .map((s) => {
      const block = sessionCleanupBlockReason(s, orderIdSet);
      return {
        id: s.id,
        stationName: s.stationName,
        productName: s.productName,
        status: s.status,
        billed: Boolean(s.billed),
        orderId: s.orderId || null,
        price: Number(s.price) || 0,
        durationMinutes: s.durationMinutes,
        startedAtMs: s.startedAtMs,
        endedAtMs: s.endedAtMs,
        isTestData: s.isTestData === true,
        blockReason: block,
        eligible: !block,
        recommended: isSessionRecommendedForCleanup(s) && !block,
      };
    })
    .sort((a, b) => (b.endedAtMs || b.startedAtMs || 0) - (a.endedAtMs || a.startedAtMs || 0));

  const eligible = rows.filter((r) => r.eligible);
  const recommendedIds = eligible.filter((r) => r.recommended).map((r) => r.id);

  return {
    rows,
    counts: {
      totalEnded: rows.length,
      eligible: eligible.length,
      recommended: recommendedIds.length,
      blocked: rows.filter((r) => r.blockReason).length,
      totalPriceEligible: Math.round(eligible.reduce((s, r) => s + r.price, 0) * 100) / 100,
    },
    recommendedIds,
    eligibleIds: eligible.map((r) => r.id),
    blockMessages: {
      active: 'جلسة نشطة — أوقفها أولاً',
      billed_live_order: 'مفوترة ومرتبطة بطلب محفوظ — علّمها وهمية أو أزل الطلب أولاً',
    },
  };
}

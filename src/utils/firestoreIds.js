/**
 * Normalize values from UI / legacy orders into a single Firestore document id segment.
 */
export function normalizeDocId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    if (typeof value.id === 'string' && value.id.trim()) return value.id.trim();
    if (typeof value.path === 'string' && value.path.trim()) {
      const seg = value.path.split('/').filter(Boolean);
      return seg.length ? seg[seg.length - 1] : '';
    }
  }
  const s = String(value).trim();
  return s === '[object Object]' ? '' : s;
}

export function assertDocId(id, label) {
  const normalized = normalizeDocId(id);
  if (!normalized) throw new Error(label || 'معرّف غير صالح');
  return normalized;
}

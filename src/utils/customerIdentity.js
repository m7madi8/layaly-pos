export function normalizeCustomerName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

/** أرقام فقط — لمطابقة الهاتف بغضّ النظر عن المسافات أو +972 */
export function normalizeCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 11) return digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 9) return digits.slice(1);
  return digits;
}

/**
 * @param {object[]} customers
 * @param {object} formData
 * @param {string|null} [excludeId]
 */
export function findDuplicateCustomer(customers, formData, excludeId = null) {
  const nameKey = normalizeCustomerName(formData.name).toLowerCase();
  const phoneKey = normalizeCustomerPhone(formData.phone);

  for (const c of customers || []) {
    if (excludeId && c.id === excludeId) continue;
    if (phoneKey && normalizeCustomerPhone(c.phone) === phoneKey) return c;
  }
  if (!nameKey) return null;
  for (const c of customers || []) {
    if (excludeId && c.id === excludeId) continue;
    if (normalizeCustomerName(c.name).toLowerCase() === nameKey) return c;
  }
  return null;
}

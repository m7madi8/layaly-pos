/** Pure authorization policy (testable without firebase-functions). */

function resolveOrderCallerAccess({ tokenRole, securityMode }) {
  if (tokenRole === 'admin' || tokenRole === 'cashier') {
    return { allowed: true, role: tokenRole };
  }
  const mode = securityMode === 'hardened' ? 'hardened' : 'legacy';
  if (mode !== 'hardened') {
    return { allowed: true, role: tokenRole || 'legacy' };
  }
  return { allowed: false, role: tokenRole || null };
}

function isAdminTokenRole(tokenRole) {
  return tokenRole === 'admin';
}

module.exports = { resolveOrderCallerAccess, isAdminTokenRole };

const { HttpsError } = require('firebase-functions/v2/https');
const { resolveOrderCallerAccess, isAdminTokenRole } = require('./authzPolicy');

function requireAuthUid(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول');
  }
  return request.auth.uid;
}

async function requireOrderCaller(request, db) {
  const uid = requireAuthUid(request);
  const tokenRole = request.auth.token.role;
  const userSnap = await db.doc(`users/${uid}`).get();
  const securityMode = userSnap.exists ? userSnap.data().securityMode : 'legacy';
  const access = resolveOrderCallerAccess({ tokenRole, securityMode });
  if (!access.allowed) {
    throw new HttpsError('permission-denied', 'يتطلب صلاحية كاشير أو مدير');
  }
  return { uid, role: access.role };
}

function requireAdminClaim(request) {
  const uid = requireAuthUid(request);
  if (!isAdminTokenRole(request.auth.token.role)) {
    throw new HttpsError('permission-denied', 'يتطلب صلاحية مدير');
  }
  return uid;
}

module.exports = { requireAuthUid, requireOrderCaller, requireAdminClaim };

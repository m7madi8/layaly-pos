/**
 * Build audit actor from verified JWT only — never from client request body.
 */
function actorFromAuth(request) {
  if (!request.auth?.uid) {
    return null;
  }
  const claimRole = request.auth.token?.role;
  return {
    uid: request.auth.uid,
    role: typeof claimRole === 'string' ? claimRole : null,
  };
}

function rejectClientSuppliedRole(data) {
  if (data && (data.role != null || data.actor != null || data.employeeId != null)) {
    return true;
  }
  return false;
}

module.exports = { actorFromAuth, rejectClientSuppliedRole };

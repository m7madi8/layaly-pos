#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(file, 'utf8');

const skipRe =
  /resolveTenantAuthContext|submitCashierJoinRequest|approveCashier|listPendingJoinRequests|adminLinkCashier|setTenantInviteCode|getTenantInviteCode|handleAdminLogin|handleEmployeeLogin|handleDisconnect|createUserWithEmail|signInWithEmailAndPassword\(auth,\s*resolveCashier|callVerifyEmployeePin|callRefreshAdminSession|signInWithCustomToken|migrateLocalDemoToFirebase\(|wasDemoMigratedForUser\(|hasLocalDemoData\(/;

const lines = s.split('\n');
const out = lines.map((line) => {
  if (skipRe.test(line)) return line;
  return line.replace(/\buser\?\.uid\b/g, 'dataUid').replace(/\buser\.uid\b/g, 'dataUid');
});

fs.writeFileSync(file, out.join('\n'));
console.log('Patched App.js for dataUid');
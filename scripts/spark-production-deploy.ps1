# Layali POS — Spark plan production deploy (NO Cloud Functions, NO hardened rules)
# Project: layaly-cafe-13c2b | Hosting: Vercel layaly-pos
# Run from repo root after: firebase login --reauth

$ErrorActionPreference = "Stop"
$Root = if ($PSScriptRoot) { Resolve-Path (Join-Path $PSScriptRoot "..") } else { Get-Location }
Set-Location $Root

$ProjectId = "layaly-cafe-13c2b"

Write-Host "=== Spark pre-flight (automated gates) ===" -ForegroundColor Cyan
Set-Location $Root
npm run test:rules
if ($LASTEXITCODE -ne 0) { throw "Firestore rules tests failed" }
npm test -- --watchAll=false
if ($LASTEXITCODE -ne 0) { throw "Application tests failed" }
$env:CI = "true"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed" }

if (-not $env:LAYALI_BACKUP_CONFIRMED) {
  Write-Host @"

BACKUP GATE (required):
  On Spark, use one of:
    - Firebase Console → Firestore → Export (if Blaze bucket available), OR
    - Operator verified offline export / documented restore test, OR
    - Signed operator log with export path + spot-check counts.

Set: `$env:LAYALI_BACKUP_CONFIRMED = 'yes' after backup is verified restorable.

"@ -ForegroundColor Yellow
  throw "Backup gate not confirmed"
}

Write-Host "=== Firebase context ===" -ForegroundColor Cyan
firebase use $ProjectId
firebase projects:list | Select-String $ProjectId

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
Copy-Item firestore.rules "firestore.rules.spark.predeploy-$stamp" -Force
Write-Host "Local rules snapshot: firestore.rules.spark.predeploy-$stamp" -ForegroundColor Green

Write-Host "=== Deploy Firestore rules + indexes (Spark tenant model) ===" -ForegroundColor Cyan
firebase deploy --only firestore:rules,firestore:indexes --project $ProjectId

Write-Host @"

=== Manual / Vercel (required) ===
1. Firebase Console: Email/Password enabled; cashier Auth user exists (separate UID).
2. Vercel Production env:
   REACT_APP_FIREBASE_* (project $ProjectId)
   REACT_APP_DEMO_MODE=false
   REACT_APP_ADMIN_EMAIL
   REACT_APP_CASHIER_EMAIL  (new — separate cashier login)
   REACT_APP_EMPLOYEE_PASSWORD / REACT_APP_VAULT_PIN (build gates)
3. Redeploy production (Dashboard or: `$env:NODE_OPTIONS='--use-system-ca'; vercel --prod` on Windows if TLS fails).
4. Smoke: admin login → bootstrap tenant → invite code → cashier join → POS sale (read-only checks first).

Rollback rules:
  Copy-Item firestore.rules.legacy.backup-20261103 firestore.rules -Force
  firebase deploy --only firestore:rules --project $ProjectId
Rollback frontend: Vercel → previous deployment.

"@ -ForegroundColor Yellow
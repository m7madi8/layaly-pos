# Layali POS — Production go-live (run from repo root after firebase login --reauth)
# Project: layaly-cafe-13c2b | Region: europe-west1 | Hosting: Vercel layaly-pos

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "=== Pre-flight tests ===" -ForegroundColor Cyan
subst L: $Root 2>$null
Set-Location L:\
npm run test:functions:financial
if ($LASTEXITCODE -ne 0) { throw "Financial gate failed" }
npm run test:rules
if ($LASTEXITCODE -ne 0) { throw "Rules tests failed" }
npm run test:functions:unit
npm run test -- --watchAll=false
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Set-Location $Root
Write-Host "=== Firebase project ===" -ForegroundColor Cyan
firebase use layaly-cafe-13c2b
firebase projects:list | Select-String layaly-cafe-13c2b

Write-Host "=== BACKUP (required) — set your GCS bucket ===" -ForegroundColor Yellow
$Bucket = $env:LAYALI_BACKUP_BUCKET
if (-not $Bucket) {
  Write-Host "Set env LAYALI_BACKUP_BUCKET=gs://your-bucket/path then re-run, or export manually from Console."
  Read-Host "Press Enter after Firestore export is done (or Ctrl+C to abort)"
}

Write-Host "=== Deploy Cloud Functions ===" -ForegroundColor Cyan
Push-Location functions
npm ci
Pop-Location
firebase deploy --only functions --project layaly-cafe-13c2b

Write-Host "=== Legacy rules backup ===" -ForegroundColor Cyan
Copy-Item firestore.rules "firestore.rules.legacy.backup-$(Get-Date -Format yyyyMMdd-HHmm)" -Force
Copy-Item firestore.rules.hardened firestore.rules -Force

Write-Host "=== Deploy hardened Firestore rules ===" -ForegroundColor Cyan
firebase deploy --only firestore:rules --project layaly-cafe-13c2b

Write-Host "=== Vercel (ensure env: TRUSTED_ORDERS, TRUSTED_CASH_SHIFTS, VERIFY_EMPLOYEE_PIN_ON_SERVER) ===" -ForegroundColor Cyan
if (Get-Command vercel -ErrorAction SilentlyContinue) {
  vercel --prod --yes
} else {
  Write-Host "Install vercel CLI or redeploy from Vercel Dashboard with latest build artifact."
}

Write-Host "=== Manual steps ===" -ForegroundColor Yellow
Write-Host "1. Set Functions secrets EMPLOYEE_PIN and VAULT_PIN in Firebase Console"
Write-Host "2. Manager login -> refreshAdminSession (or bootstrapAdminClaim once)"
Write-Host "3. Firestore: users/{ownerUid} securityMode = hardened (admin only)"
Write-Host "4. Run post-deploy smoke (docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md section 8)"
Write-Host "Done." -ForegroundColor Green

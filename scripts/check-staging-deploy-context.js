#!/usr/bin/env node
/**
 * Local guard before any staging Firebase CLI deploy (run manually; does not deploy).
 * Exits 1 if active CLI project is production or staging alias is missing.
 *
 * Usage (after user adds staging to .firebaserc):
 *   node scripts/check-staging-deploy-context.js
 *
 * Optional explicit target (still must not be production id):
 *   node scripts/check-staging-deploy-context.js --project your-staging-id
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { KNOWN_PRODUCTION_PROJECT_ID } = require('./knownProductionProject');

const root = path.resolve(__dirname, '..');
const firebasercPath = path.join(root, '.firebaserc');

function readFirebaserc() {
  if (!fs.existsSync(firebasercPath)) {
    console.error('Missing .firebaserc — copy from .firebaserc.example and add a staging alias locally.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
}

function activeFirebaseProject() {
  try {
    const out = execSync('firebase use', { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const m = out.match(/Active Project:\s*(\S+)/);
    return m ? m[1] : null;
  } catch (e) {
    const combined = (e.stdout || '') + (e.stderr || '');
    const m = combined.match(/Active Project:\s*(\S+)/);
    if (m) return m[1];
    console.error('Could not read active Firebase project. Run: firebase login && firebase use staging');
    process.exit(1);
  }
}

const explicit = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;

const rc = readFirebaserc();
const stagingAlias = rc.projects?.staging;
if (!stagingAlias || stagingAlias.includes('REPLACE_WITH')) {
  console.error(
    'Staging alias not configured in .firebaserc. Add "staging": "<your-staging-project-id>" locally (see .firebaserc.example).'
  );
  process.exit(1);
}

const active = explicit || activeFirebaseProject();
if (!active) {
  console.error('No active Firebase project.');
  process.exit(1);
}

if (active === KNOWN_PRODUCTION_PROJECT_ID) {
  console.error(
    `Refusing: active project is production (${KNOWN_PRODUCTION_PROJECT_ID}). Run: firebase use staging`
  );
  process.exit(1);
}

if (active !== stagingAlias) {
  console.warn(
    `Warning: active project "${active}" does not match .firebaserc staging alias "${stagingAlias}". Confirm this is intentional.`
  );
  process.exit(1);
}

console.log(`OK: staging deploy context — project "${active}" is not production.`);

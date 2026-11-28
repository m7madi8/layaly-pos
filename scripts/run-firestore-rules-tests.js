/**
 * Runs Firestore rules tests from an ASCII-only staging directory (Windows Arabic repo paths break the emulator).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const stageRoot = path.join(os.tmpdir(), 'layali-firestore-rules-test');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function main() {
  if (fs.existsSync(stageRoot)) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(stageRoot, { recursive: true });

  const filesToCopy = [
    'firestore.rules',
    'firestore.indexes.json',
    'package.json',
    'jest.rules.config.js',
    'jest.functions.config.js',
    'package-lock.json',
  ];
  for (const rel of filesToCopy) {
    const src = path.join(root, rel);
    if (fs.existsSync(src)) copyRecursive(src, path.join(stageRoot, rel));
  }

  copyRecursive(path.join(root, 'tests', 'security'), path.join(stageRoot, 'tests', 'security'));
  copyRecursive(path.join(root, 'tests', 'functions'), path.join(stageRoot, 'tests', 'functions'));
  copyRecursive(path.join(root, 'functions', 'lib'), path.join(stageRoot, 'functions', 'lib'));

  const nodeModules = path.join(root, 'node_modules');
  const stageNodeModules = path.join(stageRoot, 'node_modules');
  if (fs.existsSync(nodeModules) && !fs.existsSync(stageNodeModules)) {
    try {
      fs.symlinkSync(nodeModules, stageNodeModules, 'junction');
    } catch {
      copyRecursive(nodeModules, stageNodeModules);
    }
  }

  writeJson(path.join(stageRoot, 'firebase.json'), {
    firestore: {
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    },
    emulators: {
      firestore: { port: 8080 },
      singleProjectMode: true,
    },
  });

  const jestBin = 'node ./node_modules/jest/bin/jest.js';
  const inner =
    `${jestBin} -c jest.rules.config.js --runInBand && ` +
    `${jestBin} -c jest.functions.config.js --runInBand ` +
    'tests/functions/cashShift.emulator.test.js tests/functions/cardPayment.emulator.test.js ' +
    'tests/functions/financial.lifecycle.emulator.test.js';
  const cmd = `firebase emulators:exec --only firestore --project layali-rules-test "${inner}"`;

  execSync(cmd, {
    cwd: stageRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
  });
}

main();
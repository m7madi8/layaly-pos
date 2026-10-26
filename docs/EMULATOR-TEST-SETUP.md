# Firebase Emulator — financial & rules tests

## Prerequisites (Windows)

1. **Java JDK 21+** (Firebase CLI no longer supports Java &lt; 21)
   - Install [Eclipse Temurin 21](https://adoptium.net/)
   - Verify: `java -version` → 21.x

2. **Firebase CLI** — project uses `firebase-tools` from root `devDependencies` (`npx firebase` or global 13.x).

3. **Dependencies**

```powershell
cd "D:\completed\ليالي كافي"
npm install
cd functions
npm install
cd ..
```

## Arabic project path (important)

The Firestore emulator **cannot load** `firestore.rules` when the project folder name contains non-ASCII characters. Use a drive letter alias:

```powershell
subst L: "D:\completed\ليالي كافي"
cd L:
firebase emulators:start --only firestore --project layali-rules-test
```

Leave that window open. Tests can run from the original folder if `FIRESTORE_EMULATOR_HOST` is set.

**Production Firestore is never touched** — project id `layali-rules-test` is emulator-only.

## Commands

| Goal | Command |
|------|---------|
| Unit tests (no Java) | `npm run test:functions:unit` |
| Financial persistence (emulator must be running) | `$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; npm run test:functions:emulator` |
| Rules tests (emulator running) | `$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; npx jest -c jest.rules.config.js --runInBand` |
| Rules via CLI wrapper | From `L:\`: `npm run test:rules` (starts/stops emulator; needs `subst`) |
| Integration wrapper | `npm run test:functions:integration` (same as emulator + `emulators:exec`; start from `L:\`) |

If the emulator is not reachable, `test:functions:emulator` **fails** on the environment gate test (no silent skip).

## Manual two-terminal flow

**Terminal 1** (after `subst L:`):

```powershell
cd L:
firebase emulators:start --only firestore --project layali-rules-test
```

**Terminal 2**:

```powershell
cd "D:\completed\ليالي كافي"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm run test:functions:emulator
npx jest -c jest.rules.config.js --runInBand
```

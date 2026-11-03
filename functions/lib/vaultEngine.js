const { applyVaultCreditInTx, roundMoney } = require('./vaultAccounting');
const { docExists } = require('./inventoryLayerEngine');

function assertVaultPin(pin, expectedPin) {
  const p = String(pin || '').trim();
  const expected = String(expectedPin || '').trim();
  if (!expected) throw new Error('VAULT_PIN غير مضبوط على الخادم');
  if (!p || p !== expected) throw new Error('رمز الخزنة غير صحيح');
}

async function executeVaultCredit(db, uid, { amount, type, note, actor, vaultPin, expectedVaultPin }) {
  assertVaultPin(vaultPin, expectedVaultPin);
  const amt = roundMoney(amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');

  await db.runTransaction(async (tx) => {
    const vRef = db.doc(`users/${uid}/vault/main`);
    const snap = await tx.get(vRef);
    applyVaultCreditInTx(tx, db, uid, snap, {
      amount: amt,
      type,
      reason: note || (type === 'capital' ? 'إضافة رأس مال للخزنة' : 'إيداع نقدي في الخزنة'),
      actor,
    });
  });
  return { ok: true };
}

async function addVaultCapital(db, uid, data, { actor, expectedVaultPin }) {
  return executeVaultCredit(db, uid, {
    amount: data.amount,
    type: 'capital',
    note: data.note,
    actor,
    vaultPin: data.vaultPin,
    expectedVaultPin,
  });
}

async function depositVaultManual(db, uid, data, { actor, expectedVaultPin }) {
  return executeVaultCredit(db, uid, {
    amount: data.amount,
    type: 'deposit',
    note: data.note,
    actor,
    vaultPin: data.vaultPin,
    expectedVaultPin,
  });
}

module.exports = { addVaultCapital, depositVaultManual, assertVaultPin };

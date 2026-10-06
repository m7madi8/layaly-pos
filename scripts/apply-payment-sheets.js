const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(appPath, 'utf8');

function replaceBetween(startNeedle, endNeedle, replacement, label) {
  const a = s.indexOf(startNeedle);
  if (a < 0) throw new Error(`start not found: ${label}`);
  const b = s.indexOf(endNeedle, a);
  if (b < 0) throw new Error(`end not found: ${label}`);
  s = s.slice(0, a) + replacement + s.slice(b);
}

// Remove suspend confirm modal
replaceBetween(
  '      {showSuspendConfirm && (',
  '      {pendingOpenBill && (',
  '',
  'suspend confirm'
);

// Toast feedback
replaceBetween(
  '      {suspendFeedback && (',
  '      {showQuickCustomerModal && (',
  `      {suspendFeedback && (
        <div
          role="status"
          className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[90] px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-xl flex items-center gap-2"
          style={{ fontFamily: FONT_UI }}
        >
          <Check size={16} />
          {suspendFeedback}
        </div>
      )}

`,
  'toast'
);

const sheets = `      <PaymentChooserSheet
        open={showPaymentModal}
        total={cartTotal}
        customerName={currentOrder.customer}
        busy={uploadProgress}
        onClose={() => setShowPaymentModal(false)}
        onCash={() => {
          setCashGiven('');
          setFinalTotalForPayment(cartTotal);
          setShowPaymentModal(false);
          setShowCashModal(true);
        }}
        onMixed={() => {
          setMixedCashAmount('');
          setShowPaymentModal(false);
          setShowMixedPaymentModal(true);
        }}
        onDebt={() => completeOrder('unpaid', { paymentType: 'debt', customerId: currentOrder.customerId })}
      />

      <CashSheet
        open={showCashModal}
        total={finalTotalForPayment}
        given={cashGiven}
        onGivenChange={setCashGiven}
        busy={uploadProgress}
        onClose={() => setShowCashModal(false)}
        onConfirm={() => completeOrder('paid', { paymentType: 'cash', method: 'Cash' })}
      />

      <MixedSheet
        open={showMixedPaymentModal}
        total={cartTotal}
        customerName={currentOrder.customer}
        cash={mixedCashAmount}
        onCashChange={setMixedCashAmount}
        busy={uploadProgress}
        onClose={() => setShowMixedPaymentModal(false)}
        onConfirm={() =>
          completeOrder('paid', {
            paymentType: 'mixed',
            cashPaid: mixedCashAmount,
            customerId: currentOrder.customerId,
          })
        }
      />

`;

// Replace payment chooser + mixed together (they're adjacent), leave expense modal
replaceBetween(
  '      {showPaymentModal && (',
  '      {/* Expense Modal */}',
  sheets,
  'payment+mixed'
);

// Remove old cash modal
replaceBetween(
  '      {/* Cash Payment Modal */}\n      {showCashModal && (',
  '    </div>\n  );\n};\n\nfunction App()',
  '    </div>\n  );\n};\n\nfunction App()',
  'cash modal'
);

fs.writeFileSync(appPath, s);
console.log('payment sheets applied', s.includes('PaymentChooserSheet'), s.includes('CashSheet'), !s.includes('تأكيد الدفع كاش'));

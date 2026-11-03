import { mustUseFinancialCallables } from './securityMode';
import {
  callPartialOrderReturn,
  callCreatePayrollAccrual,
  callRecordPayrollPayment,
  callRecordEmployeeAdvance,
  callRecordAdvanceRepayment,
  callRegisterCheck,
  callCollectCheck,
  callReturnCheck,
  callRecordSupplierOpeningBalance,
} from './secureFunctions';
import { executePartialOrderReturn } from './orderReturnService';
import { registerCheck, collectCheck, returnCheck } from './checkService';
import { recordSupplierOpeningBalance } from './supplierOpeningBalanceService';

function shouldUseFinancialCallables(profile) {
  return mustUseFinancialCallables(profile);
}

export async function gatewayPartialOrderReturn(uid, input, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callPartialOrderReturn({ ...input, idempotencyKey: ctx.idempotencyKey });
  }
  return executePartialOrderReturn(uid, input, ctx);
}

export async function gatewayCreatePayrollAccrual(uid, data, profile) {
  if (shouldUseFinancialCallables(profile)) {
    const r = await callCreatePayrollAccrual(data);
    return r.accrualId;
  }
  const { createPayrollAccrual } = await import('./payrollService');
  return createPayrollAccrual(uid, data);
}

export async function gatewayRecordPayrollPayment(uid, data, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callRecordPayrollPayment({ ...data, idempotencyKey: ctx.idempotencyKey });
  }
  const { recordPayrollPayment } = await import('./payrollService');
  return recordPayrollPayment(uid, { ...data, ...ctx });
}

export async function gatewayRecordEmployeeAdvance(uid, data, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callRecordEmployeeAdvance({ ...data, idempotencyKey: ctx.idempotencyKey });
  }
  const { recordEmployeeAdvance } = await import('./payrollService');
  return recordEmployeeAdvance(uid, { ...data, ...ctx });
}

export async function gatewayRecordAdvanceRepayment(uid, data, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callRecordAdvanceRepayment({ ...data, idempotencyKey: ctx.idempotencyKey });
  }
  const { recordAdvanceRepayment } = await import('./payrollService');
  return recordAdvanceRepayment(uid, { ...data, ...ctx });
}

export async function gatewayRegisterCheck(uid, input, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callRegisterCheck({ ...input, idempotencyKey: ctx.idempotencyKey });
  }
  return registerCheck(uid, input, ctx);
}

export async function gatewayCollectCheck(uid, checkId, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) return callCollectCheck({ checkId, shiftId: ctx.shiftId });
  return collectCheck(uid, checkId, ctx);
}

export async function gatewayReturnCheck(uid, checkId, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) return callReturnCheck({ checkId, reason: ctx.reason });
  return returnCheck(uid, checkId, ctx);
}

export async function gatewayRecordSupplierOpeningBalance(uid, supplierId, input, ctx, profile) {
  if (shouldUseFinancialCallables(profile)) {
    return callRecordSupplierOpeningBalance({
      supplierId,
      ...input,
      idempotencyKey: ctx.idempotencyKey,
    });
  }
  return recordSupplierOpeningBalance(uid, supplierId, { ...input, actor: ctx.actor });
}

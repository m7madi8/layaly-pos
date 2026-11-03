import { mustUseFinancialCallables } from './securityMode';
import {
  callSuspendOpenBill,
  callCloseOpenBill,
  callCancelOpenBill,
  callRecordEmployeeBenefit,
  callCancelEmployeeBenefit,
  callVaultAddCapital,
  callVaultManualDeposit,
} from './secureFunctions';
import {
  suspendOpenBill as clientSuspendOpenBill,
  closeOpenBill as clientCloseOpenBill,
  cancelOpenBill as clientCancelOpenBill,
} from './openBillsService';
import { executeEmployeeBenefit as clientExecuteBenefit, cancelEmployeeBenefit as clientCancelBenefit } from './employeeBenefitService';
import { addVaultCapital as clientAddCapital, depositVaultManual as clientDeposit } from './vaultService';

function shouldUseServerCallables(profile) {
  return mustUseFinancialCallables(profile);
}

export async function gatewaySuspendOpenBill(uid, input, profile) {
  if (shouldUseServerCallables(profile)) {
    const r = await callSuspendOpenBill(input);
    return r.billId;
  }
  return clientSuspendOpenBill(uid, input);
}

export async function gatewayCloseOpenBill(uid, billId, ctx, profile) {
  if (shouldUseServerCallables(profile)) {
    return callCloseOpenBill({ billId, orderId: ctx.orderId, orderNumber: ctx.orderNumber });
  }
  return clientCloseOpenBill(uid, billId, ctx);
}

export async function gatewayCancelOpenBill(uid, billId, ctx, profile) {
  if (shouldUseServerCallables(profile)) {
    return callCancelOpenBill({ billId });
  }
  return clientCancelOpenBill(uid, billId, ctx);
}

export async function gatewayExecuteEmployeeBenefit(uid, input, ctx, profile) {
  if (shouldUseServerCallables(profile)) {
    return callRecordEmployeeBenefit({
      staffMemberId: input.staffMember?.id || input.staffMemberId,
      benefitType: input.benefitType,
      cashAmount: input.cashAmount,
      inventoryLines: input.inventoryLines,
      shiftId: input.shiftId || ctx.shiftId,
      idempotencyKey: ctx.idempotencyKey,
      override: input.override,
      overrideReason: input.overrideReason,
      notes: input.notes,
      dateMs: input.date ? new Date(input.date).getTime() : Date.now(),
    });
  }
  return clientExecuteBenefit(uid, input, ctx);
}

export async function gatewayCancelEmployeeBenefit(uid, benefitId, ctx, profile) {
  if (shouldUseServerCallables(profile)) {
    return callCancelEmployeeBenefit({ benefitId, reason: ctx.reason });
  }
  return clientCancelBenefit(uid, benefitId, ctx);
}

export async function gatewayAddVaultCapital(uid, payload, profile) {
  if (shouldUseServerCallables(profile)) {
    return callVaultAddCapital(payload);
  }
  return clientAddCapital(uid, payload);
}

export async function gatewayDepositVaultManual(uid, payload, profile) {
  if (shouldUseServerCallables(profile)) {
    return callVaultManualDeposit(payload);
  }
  return clientDeposit(uid, payload);
}

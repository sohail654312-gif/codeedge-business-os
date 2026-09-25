import "server-only";

import type { TenantContext } from "@/server/authorization/tenant";
import {
  financeProposalSchemas,
  type FinanceAIActionType,
} from "@/modules/ai-accountant/domain";
import {
  claimAIActionProposal,
  completeAIActionProposal,
  getAIActionProposal,
  rejectAIActionProposal,
} from "@/server/ai/persistence";
import { sha256Json } from "@/server/ai/integrity";
import {
  createFinanceBill,
  createFinanceExpense,
  createFinanceInvoice,
  createFinanceQuote,
  createFinanceSupplier,
  ensureFinanceCustomer,
  recordFinancePayment,
} from "@/server/finance/service";

function financeActionType(value: string): FinanceAIActionType {
  if (value in financeProposalSchemas) return value as FinanceAIActionType;
  throw new Error("ai_tool_not_allowed");
}

function safeExecutionError(error: unknown) {
  if (error instanceof Error) {
    if (/^(finance|external_effect)_[a-z0-9_]+$/.test(error.message)) {
      return error.message;
    }
  }
  return "ai_action_execution_failed";
}

function resultReference(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const row=result as { externalRef?:unknown;id?:unknown };
  if (typeof row.externalRef === "string" && row.externalRef) return row.externalRef;
  if (typeof row.id === "string") return row.id;
  return "";
}

async function executeClaimedProposal(input: {
  tenant: TenantContext;
  actionType: FinanceAIActionType;
  payload: Record<string,unknown>;
  requestId: string;
  correlationId: string;
}) {
  const common = {
    businessId:input.tenant.business.id,
    userId:input.tenant.userId,
    correlationId:input.correlationId,
    requestId:input.requestId,
  };

  switch (input.actionType) {
    case "finance.customer.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return ensureFinanceCustomer({
        ...common,
        crmCustomerId:payload.crmCustomerId,
      });
    }
    case "finance.quote.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return createFinanceQuote({
        ...common,
        crmCustomerId:payload.crmCustomerId,
        currency:payload.currency,
        amount:payload.amount,
        validUntil:payload.validUntil,
      });
    }
    case "finance.invoice.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return createFinanceInvoice({
        ...common,
        quoteId:payload.quoteId ?? null,
        crmCustomerId:payload.crmCustomerId,
        currency:payload.currency,
        amount:payload.amount,
        dueAt:payload.dueAt,
      });
    }
    case "finance.supplier.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return createFinanceSupplier({
        ...common,
        name:payload.name,
        email:payload.email,
        phone:payload.phone,
      });
    }
    case "finance.bill.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return createFinanceBill({
        ...common,
        supplierId:payload.supplierId,
        currency:payload.currency,
        amount:payload.amount,
        dueAt:payload.dueAt,
      });
    }
    case "finance.expense.create": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return createFinanceExpense({
        ...common,
        supplierId:payload.supplierId,
        category:payload.category,
        currency:payload.currency,
        amount:payload.amount,
        incurredAt:payload.incurredAt,
      });
    }
    case "finance.payment.record": {
      const payload=financeProposalSchemas[input.actionType].parse(input.payload);
      return recordFinancePayment({
        ...common,
        invoiceId:payload.invoiceId,
        currency:payload.currency,
        amount:payload.amount,
      });
    }
  }
}

export async function approveAIAccountantProposal(input: {
  tenant: TenantContext;
  proposalId: string;
}) {
  if (input.tenant.role !== "owner") {
    throw new Error("ai_action_requires_approval");
  }

  const stored=await getAIActionProposal({
    businessId:input.tenant.business.id,
    userId:input.tenant.userId,
    proposalId:input.proposalId,
  });
  if (!stored) throw new Error("ai_action_requires_approval");
  if (stored.status !== "proposed") {
    throw new Error(
      stored.status === "succeeded"
        ? "ai_action_already_executed"
        : "ai_action_requires_approval",
    );
  }

  const actionType=financeActionType(stored.action_type);
  const validated=financeProposalSchemas[actionType].parse(stored.payload)
    as Record<string,unknown>;
  const currentHash=sha256Json(validated);
  if (currentHash !== stored.payload_hash) {
    throw new Error("ai_action_payload_tampered");
  }

  const claimed=await claimAIActionProposal({
    businessId:input.tenant.business.id,
    userId:input.tenant.userId,
    proposalId:stored.id,
    payloadHash:currentHash,
  });

  try {
    const result=await executeClaimedProposal({
      tenant:input.tenant,
      actionType,
      payload:claimed.payload,
      requestId:claimed.request_id,
      correlationId:claimed.correlation_id,
    });
    const reference=resultReference(result);

    await completeAIActionProposal({
      businessId:input.tenant.business.id,
      proposalId:stored.id,
      status:"succeeded",
      resultReference:reference,
    });

    return {
      proposalId:stored.id,
      status:"succeeded" as const,
      resultReference:reference,
    };
  } catch (error) {
    const code=safeExecutionError(error);
    await completeAIActionProposal({
      businessId:input.tenant.business.id,
      proposalId:stored.id,
      status:"failed",
      errorCode:code,
    }).catch(() => undefined);
    throw new Error(code);
  }
}

export async function rejectAIAccountantProposal(input: {
  tenant: TenantContext;
  proposalId: string;
}) {
  if (input.tenant.role !== "owner") {
    throw new Error("ai_action_requires_approval");
  }

  await rejectAIActionProposal({
    businessId:input.tenant.business.id,
    userId:input.tenant.userId,
    proposalId:input.proposalId,
  });
  return { proposalId:input.proposalId,status:"rejected" as const };
}

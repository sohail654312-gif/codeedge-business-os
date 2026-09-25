import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/authorization/tenant";
import { sha256Json } from "@/server/ai/integrity";

const mocks=vi.hoisted(() => ({
  claimAIActionProposal:vi.fn(),
  completeAIActionProposal:vi.fn(),
  getAIActionProposal:vi.fn(),
  rejectAIActionProposal:vi.fn(),
  createFinanceBill:vi.fn(),
  createFinanceExpense:vi.fn(),
  createFinanceInvoice:vi.fn(),
  createFinanceQuote:vi.fn(),
  createFinanceSupplier:vi.fn(),
  ensureFinanceCustomer:vi.fn(),
  recordFinancePayment:vi.fn(),
}));

vi.mock("@/server/ai/persistence",() => ({
  claimAIActionProposal:mocks.claimAIActionProposal,
  completeAIActionProposal:mocks.completeAIActionProposal,
  getAIActionProposal:mocks.getAIActionProposal,
  rejectAIActionProposal:mocks.rejectAIActionProposal,
}));

vi.mock("@/server/finance/service",() => ({
  createFinanceBill:mocks.createFinanceBill,
  createFinanceExpense:mocks.createFinanceExpense,
  createFinanceInvoice:mocks.createFinanceInvoice,
  createFinanceQuote:mocks.createFinanceQuote,
  createFinanceSupplier:mocks.createFinanceSupplier,
  ensureFinanceCustomer:mocks.ensureFinanceCustomer,
  recordFinancePayment:mocks.recordFinancePayment,
}));

import {
  approveAIAccountantProposal,
  rejectAIAccountantProposal,
} from "@/server/ai/accountant/approval";

const businessId="20000000-0000-4000-8000-000000000001";
const ownerId="10000000-0000-4000-8000-000000000001";
const proposalId="82000000-0000-4000-8000-000000000001";
const correlationId="83000000-0000-4000-8000-000000000001";

function tenant(role: "owner" | "staff" = "owner"): TenantContext {
  return {
    userId:role==="owner"
      ? ownerId
      : "10000000-0000-4000-8000-000000000003",
    role,
    business:{
      id:businessId,
      name:"Business A",
      slug:"business-a",
      status:"active",
      timezone:"Europe/London",
      execution_mode:"demo",
      created_at:"2026-09-25T00:00:00Z",
      updated_at:"2026-09-25T00:00:00Z",
    },
  };
}

function invoicePayload() {
  return {
    quoteId:null,
    crmCustomerId:"90000000-0000-4000-8000-000000000001",
    currency:"GBP",
    amount:"500.00",
    dueAt:null,
  };
}

function storedProposal(overrides: Record<string,unknown> = {}) {
  const payload=invoicePayload();
  return {
    id:proposalId,
    business_id:businessId,
    session_id:"81000000-0000-4000-8000-000000000001",
    action_type:"finance.invoice.create",
    payload,
    payload_hash:sha256Json(payload),
    status:"proposed",
    requested_by:ownerId,
    approved_by:null,
    execution_mode:"demo",
    finance_engine:"demo_finance",
    correlation_id:correlationId,
    request_id:proposalId,
    result_reference:"",
    error_code:null,
    created_at:"2026-09-25T10:00:00Z",
    expires_at:"2026-09-25T10:15:00Z",
    approved_at:null,
    executed_at:null,
    ...overrides,
  };
}

describe("AI Accountant human approval execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIActionProposal.mockResolvedValue(storedProposal());
    mocks.claimAIActionProposal.mockResolvedValue({
      proposal_id:proposalId,
      action_type:"finance.invoice.create",
      payload:invoicePayload(),
      request_id:proposalId,
      correlation_id:correlationId,
      finance_engine:"demo_finance",
      execution_mode:"demo",
    });
    mocks.createFinanceInvoice.mockResolvedValue({
      id:"demo-invoice-1",
      externalRef:"demo:invoice-1",
    });
    mocks.completeAIActionProposal.mockResolvedValue(undefined);
  });

  it("never lets staff approval become a Finance write", async () => {
    await expect(approveAIAccountantProposal({
      tenant:tenant("staff"),
      proposalId,
    })).rejects.toThrow("ai_action_requires_approval");

    expect(mocks.getAIActionProposal).not.toHaveBeenCalled();
    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });

  it("executes an approved immutable invoice through the existing Finance service", async () => {
    await expect(approveAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).resolves.toEqual({
      proposalId,
      status:"succeeded",
      resultReference:"demo:invoice-1",
    });

    expect(mocks.claimAIActionProposal).toHaveBeenCalledWith({
      businessId,
      userId:ownerId,
      proposalId,
      payloadHash:sha256Json(invoicePayload()),
    });
    expect(mocks.createFinanceInvoice).toHaveBeenCalledWith({
      businessId,
      userId:ownerId,
      correlationId,
      requestId:proposalId,
      quoteId:null,
      crmCustomerId:"90000000-0000-4000-8000-000000000001",
      currency:"GBP",
      amount:"500.00",
      dueAt:null,
    });
    expect(mocks.completeAIActionProposal).toHaveBeenCalledWith({
      businessId,
      proposalId,
      status:"succeeded",
      resultReference:"demo:invoice-1",
    });
  });

  it("rejects stored-payload tampering before proposal claim or Finance execution", async () => {
    mocks.getAIActionProposal.mockResolvedValue(storedProposal({
      payload:{ ...invoicePayload(),amount:"9999.00" },
    }));

    await expect(approveAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).rejects.toThrow("ai_action_payload_tampered");

    expect(mocks.claimAIActionProposal).not.toHaveBeenCalled();
    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });

  it("fails closed when approval-time mode or engine revalidation refuses the claim", async () => {
    mocks.claimAIActionProposal.mockRejectedValue(
      new Error("AI Finance context changed"),
    );

    await expect(approveAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).rejects.toThrow("AI Finance context changed");

    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });

  it("does not execute a proposal already completed by an earlier click", async () => {
    mocks.getAIActionProposal.mockResolvedValue(storedProposal({
      status:"succeeded",
      executed_at:"2026-09-25T10:05:00Z",
    }));

    await expect(approveAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).rejects.toThrow("ai_action_already_executed");

    expect(mocks.claimAIActionProposal).not.toHaveBeenCalled();
    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });

  it("records a normalized failure after a claimed Finance write fails", async () => {
    mocks.createFinanceInvoice.mockRejectedValue(
      new Error("finance_capability_unavailable"),
    );

    await expect(approveAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).rejects.toThrow("finance_capability_unavailable");

    expect(mocks.completeAIActionProposal).toHaveBeenCalledWith({
      businessId,
      proposalId,
      status:"failed",
      errorCode:"finance_capability_unavailable",
    });
  });

  it("rejects a proposal without any Finance write", async () => {
    mocks.rejectAIActionProposal.mockResolvedValue(true);

    await expect(rejectAIAccountantProposal({
      tenant:tenant(),
      proposalId,
    })).resolves.toEqual({
      proposalId,
      status:"rejected",
    });

    expect(mocks.rejectAIActionProposal).toHaveBeenCalledWith({
      businessId,
      userId:ownerId,
      proposalId,
    });
    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });
});

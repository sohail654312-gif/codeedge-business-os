import "server-only";

import type {
  AIActionProposalRecord,
  AIMessageRecord,
} from "@/server/ai/persistence";

const sessionId="81000000-0000-4000-8000-00000000e2e1";
const proposalId="82000000-0000-4000-8000-00000000e2e1";
const ownerId="10000000-0000-4000-8000-000000000001";
const businessId="20000000-0000-4000-8000-000000000001";

type HarnessState = {
  messages: AIMessageRecord[];
  proposals: AIActionProposalRecord[];
  financeDocumentCount: number;
};

declare global {
  var __codeedgeAIAccountantE2EState: HarnessState | undefined;
}

function initialState(): HarnessState {
  return {
    messages:[],
    proposals:[],
    financeDocumentCount:0,
  };
}

export function requireE2EHarness() {
  if (process.env.CODEEDGE_E2E_HARNESS !== "1") {
    throw new Error("e2e_harness_disabled");
  }
}

export function getAIAccountantE2EState() {
  requireE2EHarness();
  globalThis.__codeedgeAIAccountantE2EState ??= initialState();
  return globalThis.__codeedgeAIAccountantE2EState;
}

export function resetAIAccountantE2EState() {
  requireE2EHarness();
  globalThis.__codeedgeAIAccountantE2EState=initialState();
}

export function harnessSessionId() {
  return sessionId;
}

export function harnessProposalId() {
  return proposalId;
}

export function snapshotAIAccountantE2EState() {
  const current=getAIAccountantE2EState();
  return {
    messages:current.messages.map((message)=>({
      ...message,
    })),
    proposals:current.proposals.map((proposal)=>({
      ...proposal,
      payload:{ ...proposal.payload },
    })),
    financeDocumentCount:current.financeDocumentCount,
  };
}

export function makeHarnessMessage(input: {
  id:string;
  role:"user"|"assistant";
  content:string;
}): AIMessageRecord {
  return {
    id:input.id,
    business_id:businessId,
    session_id:sessionId,
    role:input.role,
    content:input.content,
    provider:input.role==="assistant" ? "demo_ai" : "",
    model:input.role==="assistant" ? "codeedge-demo-accountant-v1" : "",
    created_at:new Date().toISOString(),
  };
}

export function makeInvoiceProposal(): AIActionProposalRecord {
  const now=Date.now();
  return {
    id:proposalId,
    business_id:businessId,
    session_id:sessionId,
    action_type:"finance.invoice.create",
    payload:{
      quoteId:null,
      crmCustomerId:"40000000-0000-4000-8000-000000000001",
      currency:"GBP",
      amount:"500.00",
      dueAt:"2026-10-15T23:59:59Z",
    },
    payload_hash:"e2e".padEnd(64,"0"),
    status:"proposed",
    requested_by:ownerId,
    approved_by:null,
    execution_mode:"demo",
    finance_engine:"demo_finance",
    correlation_id:"83000000-0000-4000-8000-00000000e2e1",
    request_id:proposalId,
    result_reference:"",
    error_code:null,
    created_at:new Date(now).toISOString(),
    expires_at:new Date(now+15*60_000).toISOString(),
    approved_at:null,
    executed_at:null,
  };
}

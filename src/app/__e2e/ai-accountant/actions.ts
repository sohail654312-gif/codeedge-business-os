"use server";

import { revalidatePath } from "next/cache";
import type { AIAccountantActionState } from "@/modules/ai-accountant/actions";
import {
  getAIAccountantE2EState,
  harnessProposalId,
  harnessSessionId,
  makeHarnessMessage,
  makeInvoiceProposal,
  requireE2EHarness,
  snapshotAIAccountantE2EState,
} from "./state";

function response(extra: Partial<AIAccountantActionState> = {}): AIAccountantActionState {
  const snapshot=snapshotAIAccountantE2EState();
  return {
    sessionId:harnessSessionId(),
    messages:snapshot.messages,
    proposals:snapshot.proposals,
    ...extra,
  };
}

export async function submitAIAccountantE2EAction(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  requireE2EHarness();
  const message=String(formData.get("message") ?? "").trim();
  if (!message || message.length>4000) {
    return { error:"Enter a finance question up to 4,000 characters." };
  }

  const state=getAIAccountantE2EState();
  state.messages.push(makeHarnessMessage({
    id:"84000000-0000-4000-8000-"+String(state.messages.length+1).padStart(12,"0"),
    role:"user",
    content:message,
  }));

  const normalized=message.toLowerCase();
  if (normalized.includes("create") && normalized.includes("invoice")) {
    if (!state.proposals.some((proposal)=>proposal.id===harnessProposalId())) {
      state.proposals.push(makeInvoiceProposal());
    }
    const answer="I prepared an invoice proposal only. Review the exact action card and approve it before Codeedge Finance executes anything.";
    state.messages.push(makeHarnessMessage({
      id:"84000000-0000-4000-8000-"+String(state.messages.length+1).padStart(12,"0"),
      role:"assistant",
      content:answer,
    }));
    return response({
      answer,
      provider:"demo_ai",
      model:"codeedge-demo-accountant-v1",
    });
  }

  const answer="Based on the Codeedge Money Dashboard as of the Demo workspace snapshot: receivables are GBP 350.00 and the figures come from Finance evidence, not model estimation.";
  state.messages.push(makeHarnessMessage({
    id:"84000000-0000-4000-8000-"+String(state.messages.length+1).padStart(12,"0"),
    role:"assistant",
    content:answer,
  }));

  return response({
    answer,
    provider:"demo_ai",
    model:"codeedge-demo-accountant-v1",
    evidence:[{
      tool:"money_dashboard",
      documentType:"Money Dashboard",
      asOf:"2026-09-25T10:00:00Z",
      currency:"GBP",
    }],
  });
}

export async function approveAIAccountantE2EAction(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  requireE2EHarness();
  const proposalId=String(formData.get("proposal_id") ?? "");
  const state=getAIAccountantE2EState();
  const proposal=state.proposals.find((item)=>item.id===proposalId);
  if (!proposal) return { error:"Invalid proposal." };

  if (proposal.status!=="proposed") {
    return {
      error:"That proposal has already been executed. Codeedge will not run it twice.",
    };
  }

  proposal.status="succeeded";
  proposal.approved_by="10000000-0000-4000-8000-000000000001";
  proposal.approved_at=new Date().toISOString();
  proposal.executed_at=proposal.approved_at;
  proposal.result_reference="demo:e2e-invoice-1";
  state.financeDocumentCount+=1;

  revalidatePath("/__e2e/ai-accountant");
  return {
    success:"Approved and executed through Codeedge Finance: demo:e2e-invoice-1",
  };
}

export async function rejectAIAccountantE2EAction(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  requireE2EHarness();
  const proposalId=String(formData.get("proposal_id") ?? "");
  const state=getAIAccountantE2EState();
  const proposal=state.proposals.find((item)=>item.id===proposalId);
  if (!proposal) return { error:"Invalid proposal." };
  if (proposal.status!=="proposed") {
    return { error:"This proposal is no longer pending." };
  }
  proposal.status="rejected";
  revalidatePath("/__e2e/ai-accountant");
  return { success:"Proposal rejected. No Finance write was executed." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { runAIAccountantTurn } from "@/server/ai/accountant/runtime";
import {
  approveAIAccountantProposal,
  rejectAIAccountantProposal,
} from "@/server/ai/accountant/approval";
import {
  getAISessionMessages,
  getAISessionProposals,
  type AIActionProposalRecord,
  type AIMessageRecord,
} from "@/server/ai/persistence";

export type AIAccountantActionState = {
  error?: string;
  success?: string;
  sessionId?: string;
  answer?: string;
  provider?: string;
  model?: string;
  evidence?: Array<{
    tool?:string;
    documentType?:string;
    asOf?:string;
    currency?:string|null;
    documentIds?:string[];
  }>;
  messages?: AIMessageRecord[];
  proposals?: AIActionProposalRecord[];
};

const messageFormSchema=z.object({
  session_id:z.union([z.string().uuid(),z.literal("")]).optional(),
  message:z.string().trim().min(1).max(4000),
}).strict();

const proposalFormSchema=z.object({
  proposal_id:z.string().uuid(),
}).strict();

function friendlyError(error: unknown) {
  const code=error instanceof Error ? error.message : "ai_request_invalid";
  switch (code) {
    case "ai_rate_limited":
      return "AI Accountant request limit reached for this minute. Try again shortly.";
    case "ai_provider_unavailable":
    case "ai_provider_timeout":
    case "ai_provider_malformed_response":
      return "The AI provider is unavailable right now. No financial figures were invented and no Finance action was executed.";
    case "ai_finance_capability_unavailable":
      return "The active Finance Engine does not support the requested data.";
    case "ai_tool_not_allowed":
    case "ai_tool_validation_failed":
    case "ai_finance_target_unavailable":
      return "That request could not be safely validated against Codeedge Finance.";
    case "ai_action_already_executed":
      return "That proposal has already been executed. Codeedge will not run it twice.";
    case "ai_action_payload_tampered":
      return "Proposal integrity validation failed. The action was not executed.";
    case "ai_action_requires_approval":
      return "Only an authorized owner can approve this pending financial action.";
    case "ai_action_execution_failed":
      return "Codeedge could not complete the approved Finance action.";
    default:
      if (/^(finance|external_effect)_[a-z0-9_]+$/.test(code)) {
        return "Codeedge Finance blocked or could not complete that action safely.";
      }
      return "AI Accountant could not safely complete that request.";
  }
}

export async function submitAIAccountantMessage(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  const parsed=messageFormSchema.safeParse({
    session_id:String(formData.get("session_id") ?? ""),
    message:formData.get("message"),
  });
  if (!parsed.success) {
    return { error:"Enter a finance question up to 4,000 characters." };
  }

  const { context }=await requireDashboardTenant();
  try {
    const result=await runAIAccountantTurn({
      tenant:context,
      sessionId:parsed.data.session_id || null,
      message:parsed.data.message,
    });
    const messages=await getAISessionMessages({
      businessId:context.business.id,
      userId:context.userId,
      sessionId:result.sessionId,
      limit:30,
    });

    revalidatePath("/dashboard/money/ai-accountant");
    return {
      sessionId:result.sessionId,
      answer:result.answer,
      provider:result.provider,
      model:result.model,
      evidence:result.evidence,
      messages,
      proposals:result.proposals,
    };
  } catch (error) {
    return { error:friendlyError(error) };
  }
}

export async function approveAIProposalAction(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  const parsed=proposalFormSchema.safeParse({
    proposal_id:formData.get("proposal_id"),
  });
  if (!parsed.success) return { error:"Invalid proposal." };

  const { context }=await requireDashboardTenant();
  try {
    const result=await approveAIAccountantProposal({
      tenant:context,
      proposalId:parsed.data.proposal_id,
    });
    revalidatePath("/dashboard/money/ai-accountant");
    return {
      success:result.resultReference
        ? "Approved and executed through Codeedge Finance: "+result.resultReference
        : "Approved and executed through Codeedge Finance.",
    };
  } catch (error) {
    return { error:friendlyError(error) };
  }
}

export async function rejectAIProposalAction(
  _state: AIAccountantActionState,
  formData: FormData,
): Promise<AIAccountantActionState> {
  const parsed=proposalFormSchema.safeParse({
    proposal_id:formData.get("proposal_id"),
  });
  if (!parsed.success) return { error:"Invalid proposal." };

  const { context }=await requireDashboardTenant();
  try {
    await rejectAIAccountantProposal({
      tenant:context,
      proposalId:parsed.data.proposal_id,
    });
    revalidatePath("/dashboard/money/ai-accountant");
    return { success:"Proposal rejected. No Finance write was executed." };
  } catch (error) {
    return { error:friendlyError(error) };
  }
}

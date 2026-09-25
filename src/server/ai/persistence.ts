import "server-only";

import { withAICapability } from "./capability";
import type { ExecutionMode } from "@/types/database";

export type AISessionRecord = {
  id: string;
  business_id: string;
  agent_type: "accountant";
  created_by: string;
  status: "active" | "closed";
  provider: string;
  model: string;
  prompt_version: string;
  created_at: string;
  updated_at: string;
};

export type AIMessageRecord = {
  id: string;
  business_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  provider: string;
  model: string;
  created_at: string;
};

export type AIProposalStatus =
  | "proposed"
  | "executing"
  | "succeeded"
  | "failed"
  | "rejected"
  | "expired"
  | "cancelled";

export type AIActionProposalRecord = {
  id: string;
  business_id: string;
  session_id: string;
  action_type: string;
  payload: Record<string,unknown>;
  payload_hash: string;
  status: AIProposalStatus;
  requested_by: string;
  approved_by: string | null;
  execution_mode: ExecutionMode;
  finance_engine: string;
  correlation_id: string;
  request_id: string;
  result_reference: string;
  error_code: string | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  executed_at: string | null;
};

export async function consumeAIRequest(input: {
  businessId: string;
  userId: string;
  limit?: number;
}) {
  const count = await withAICapability(async (db) => {
    const result = await db.query<{ ai_consume_request:number }>(
      "select public.ai_consume_request($1,$2)",
      [input.businessId,input.userId],
    );
    return Number(result.rows[0]?.ai_consume_request ?? 0);
  });

  if (count > (input.limit ?? 20)) {
    throw new Error("ai_rate_limited");
  }
  return count;
}

export async function startAISession(input: {
  sessionId: string;
  businessId: string;
  userId: string;
  provider: string;
  model: string;
  promptVersion: string;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<{ ai_start_session:string }>(
      "select public.ai_start_session($1,$2,$3,$4,$5,$6)",
      [
        input.sessionId,input.businessId,input.userId,input.provider,
        input.model,input.promptVersion,
      ],
    );
    const id = result.rows[0]?.ai_start_session;
    if (!id) throw new Error("ai_session_unavailable");
    return id;
  });
}

export async function appendAIMessage(input: {
  businessId: string;
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<{ ai_append_message:string }>(
      "select public.ai_append_message($1,$2,$3,$4,$5,$6,$7)",
      [
        input.businessId,input.userId,input.sessionId,input.role,input.content,
        input.provider ?? "",input.model ?? "",
      ],
    );
    const id = result.rows[0]?.ai_append_message;
    if (!id) throw new Error("ai_message_unavailable");
    return id;
  });
}

export async function recordAIToolRun(input: {
  businessId: string;
  userId: string;
  sessionId: string;
  toolName: string;
  status: "succeeded" | "failed";
  correlationId: string;
  inputHash: string;
  outputSummary: Record<string,unknown>;
  errorCode?: string | null;
  provider: string;
  model: string;
  latencyMs: number;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<{ ai_record_tool_run:string }>(
      "select public.ai_record_tool_run($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)",
      [
        input.businessId,input.userId,input.sessionId,input.toolName,input.status,
        input.correlationId,input.inputHash,JSON.stringify(input.outputSummary),
        input.errorCode ?? null,input.provider,input.model,input.latencyMs,
      ],
    );
    return result.rows[0]?.ai_record_tool_run ?? null;
  });
}

export async function createAIActionProposal(input: {
  proposalId: string;
  businessId: string;
  userId: string;
  sessionId: string;
  actionType: string;
  payload: Record<string,unknown>;
  payloadHash: string;
  expiresAt: string;
  correlationId: string;
  financeEngine: string;
  executionMode: ExecutionMode;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<{ ai_create_action_proposal:string }>(
      "select public.ai_create_action_proposal($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)",
      [
        input.proposalId,input.businessId,input.userId,input.sessionId,
        input.actionType,JSON.stringify(input.payload),input.payloadHash,
        input.expiresAt,input.correlationId,input.financeEngine,input.executionMode,
      ],
    );
    const id = result.rows[0]?.ai_create_action_proposal;
    if (!id) throw new Error("ai_action_proposal_failed");
    return id;
  });
}

export type ClaimedAIActionProposal = {
  proposal_id: string;
  action_type: string;
  payload: Record<string,unknown>;
  request_id: string;
  correlation_id: string;
  finance_engine: string;
  execution_mode: ExecutionMode;
};

export async function claimAIActionProposal(input: {
  businessId: string;
  userId: string;
  proposalId: string;
  payloadHash: string;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<ClaimedAIActionProposal>(
      "select * from public.ai_claim_action_proposal($1,$2,$3,$4)",
      [input.businessId,input.userId,input.proposalId,input.payloadHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ai_action_requires_approval");
    return row;
  });
}

export async function rejectAIActionProposal(input: {
  businessId: string;
  userId: string;
  proposalId: string;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<{ ai_reject_action_proposal:boolean }>(
      "select public.ai_reject_action_proposal($1,$2,$3)",
      [input.businessId,input.userId,input.proposalId],
    );
    return result.rows[0]?.ai_reject_action_proposal === true;
  });
}

export async function completeAIActionProposal(input: {
  businessId: string;
  proposalId: string;
  status: "succeeded" | "failed";
  resultReference?: string;
  errorCode?: string | null;
}) {
  await withAICapability(async (db) => {
    await db.query(
      "select public.ai_complete_action_proposal($1,$2,$3,$4,$5)",
      [
        input.businessId,input.proposalId,input.status,
        input.resultReference ?? "",input.errorCode ?? null,
      ],
    );
  });
}

export async function getAIActionProposal(input: {
  businessId: string;
  userId: string;
  proposalId: string;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<AIActionProposalRecord>(
      "select * from public.ai_get_action_proposal($1,$2,$3)",
      [input.businessId,input.userId,input.proposalId],
    );
    return result.rows[0] ?? null;
  });
}

export async function getRecentAISessions(input: {
  businessId: string;
  userId: string;
  limit?: number;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<AISessionRecord>(
      "select * from public.ai_recent_sessions($1,$2,$3)",
      [input.businessId,input.userId,input.limit ?? 10],
    );
    return result.rows;
  });
}

export async function getAISessionMessages(input: {
  businessId: string;
  userId: string;
  sessionId: string;
  limit?: number;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<AIMessageRecord>(
      "select * from public.ai_session_messages($1,$2,$3,$4)",
      [input.businessId,input.userId,input.sessionId,input.limit ?? 20],
    );
    return result.rows;
  });
}

export async function getAISessionProposals(input: {
  businessId: string;
  userId: string;
  sessionId: string;
  limit?: number;
}) {
  return withAICapability(async (db) => {
    const result = await db.query<AIActionProposalRecord>(
      "select * from public.ai_session_proposals($1,$2,$3,$4)",
      [input.businessId,input.userId,input.sessionId,input.limit ?? 20],
    );
    return result.rows;
  });
}

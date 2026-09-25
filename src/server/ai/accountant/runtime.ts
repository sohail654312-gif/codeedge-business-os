import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TenantContext } from "@/server/authorization/tenant";
import { FinanceCapabilityError } from "@/server/finance/engine";
import { getAIProviderForContext } from "@/server/ai/registry";
import type {
  AIProviderMessage,
  AIProviderResult,
} from "@/server/ai/provider";
import { AIProviderError } from "@/server/ai/provider";
import { sha256Json, stableJson } from "@/server/ai/integrity";
import {
  appendAIMessage,
  consumeAIRequest,
  getAISessionMessages,
  getAISessionProposals,
  recordAIModelRun,
  recordAIToolRun,
  startAISession,
} from "@/server/ai/persistence";
import { aiAccountantPromptVersion } from "@/modules/ai-accountant/domain";
import {
  buildAIAccountantSystemInstructions,
  loadAIAccountantTrustedContext,
} from "./context";
import {
  aiAccountantProviderTools,
  aiAccountantToolRegistry,
  executeAIAccountantTool,
} from "./tools";

const messageSchema=z.string().trim().min(1).max(4000);
const sessionIdSchema=z.string().uuid();

function normalizedError(error: unknown) {
  if (error instanceof AIProviderError) return error.code;
  if (error instanceof FinanceCapabilityError) {
    return "ai_finance_capability_unavailable";
  }
  if (error instanceof Error) {
    if ([
      "ai_rate_limited",
      "ai_tool_not_allowed",
      "ai_tool_validation_failed",
      "ai_tool_result_invalid",
      "ai_finance_target_unavailable",
      "ai_tool_loop_detected",
      "ai_tool_loop_limit",
      "ai_provider_unavailable",
      "ai_provider_timeout",
      "ai_provider_malformed_response",
      "finance_capability_unavailable",
    ].includes(error.message)) {
      return error.message === "finance_capability_unavailable"
        ? "ai_finance_capability_unavailable"
        : error.message;
    }
  }
  return "ai_request_invalid";
}

function safeToolFailure(toolName: string,errorCode: string) {
  const proposal = toolName.startsWith("propose_");
  if (proposal) {
    return "I could not validate that financial action against the current Codeedge Finance data, so no proposal or Finance write was created.";
  }
  if (errorCode === "ai_finance_capability_unavailable") {
    return "The active Finance Engine does not expose the requested data. I will not estimate or invent a financial figure.";
  }
  return "I could not retrieve verified Codeedge Finance data for that request. I will not estimate or invent a financial figure.";
}

function auditSummary(result: unknown): Record<string,unknown> {
  if (!result || typeof result !== "object") return { result:"completed" };
  const row=result as {
    source?:unknown;
    proposal?:unknown;
    data?:unknown;
  };
  const summary: Record<string,unknown> = {};
  if (row.source && typeof row.source === "object") summary.source=row.source;
  if (row.proposal && typeof row.proposal === "object") summary.proposal=row.proposal;
  if (row.data && typeof row.data === "object") {
    const data=row.data as Record<string,unknown>;
    summary.dataKeys=Object.keys(data).slice(0,20);
    for (const [key,value] of Object.entries(data)) {
      if (Array.isArray(value)) summary[key+"Count"]=value.length;
    }
  }
  return summary;
}

function evidenceFrom(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const source=(result as { source?:unknown }).source;
  if (!source || typeof source !== "object") return null;
  return source as {
    tool?:string;
    documentType?:string;
    asOf?:string;
    currency?:string|null;
    documentIds?:string[];
  };
}

async function invokeProvider(input: {
  tenant: TenantContext;
  sessionId: string;
  provider: ReturnType<typeof getAIProviderForContext>;
  context: Awaited<ReturnType<typeof loadAIAccountantTrustedContext>>;
  messages: AIProviderMessage[];
}) {
  const started=Date.now();
  try {
    const result=await input.provider.generate({
      messages:input.messages,
      tools:aiAccountantProviderTools,
      executionMode:input.context.executionMode,
      defaultCurrency:input.context.defaultCurrency,
    });
    await recordAIModelRun({
      businessId:input.context.businessId,
      userId:input.context.userId,
      sessionId:input.sessionId,
      provider:result.provider,
      model:result.model,
      status:"succeeded",
      providerRequestId:result.providerRequestId,
      inputTokens:result.usage?.inputTokens,
      outputTokens:result.usage?.outputTokens,
      totalTokens:result.usage?.totalTokens,
      latencyMs:Date.now()-started,
    });
    return result;
  } catch (error) {
    await recordAIModelRun({
      businessId:input.context.businessId,
      userId:input.context.userId,
      sessionId:input.sessionId,
      provider:input.provider.id,
      model:input.provider.model,
      status:"failed",
      latencyMs:Date.now()-started,
      errorCode:normalizedError(error),
    }).catch(() => undefined);
    throw error;
  }
}

export type AIAccountantTurnResult = {
  sessionId: string;
  answer: string;
  provider: string;
  model: string;
  evidence: Array<{
    tool?:string;
    documentType?:string;
    asOf?:string;
    currency?:string|null;
    documentIds?:string[];
  }>;
  proposals: Awaited<ReturnType<typeof getAISessionProposals>>;
};

export async function runAIAccountantTurn(input: {
  tenant: TenantContext;
  sessionId?: string | null;
  message: string;
}): Promise<AIAccountantTurnResult> {
  const userMessage=messageSchema.parse(input.message);
  const correlationId=randomUUID();
  const context=await loadAIAccountantTrustedContext({
    tenant:input.tenant,
    correlationId,
  });

  await consumeAIRequest({
    businessId:context.businessId,
    userId:context.userId,
    limit:20,
  });

  const provider=getAIProviderForContext({
    businessId:context.businessId,
    executionMode:context.executionMode,
  });
  const sessionId=input.sessionId
    ? sessionIdSchema.parse(input.sessionId)
    : randomUUID();

  await startAISession({
    sessionId,
    businessId:context.businessId,
    userId:context.userId,
    provider:provider.id,
    model:provider.model,
    promptVersion:aiAccountantPromptVersion,
  });

  await appendAIMessage({
    businessId:context.businessId,
    userId:context.userId,
    sessionId,
    role:"user",
    content:userMessage,
  });

  const history=await getAISessionMessages({
    businessId:context.businessId,
    userId:context.userId,
    sessionId,
    limit:12,
  });

  const messages: AIProviderMessage[] = [
    {
      role:"system",
      content:buildAIAccountantSystemInstructions(context),
    },
    ...history.map((message) => ({
      role:message.role,
      content:message.content,
    } as AIProviderMessage)),
  ];

  const seenToolRequests=new Set<string>();
  const evidence: AIAccountantTurnResult["evidence"]=[];
  let lastProviderResult: AIProviderResult | null=null;
  let deterministicFailure: string | null=null;

  for (let round=0;round<3;round++) {
    const providerResult=await invokeProvider({
      tenant:input.tenant,
      sessionId,
      provider,
      context,
      messages,
    });
    lastProviderResult=providerResult;

    if (providerResult.toolCalls.length === 0) break;
    if (providerResult.toolCalls.length > 8) {
      throw new Error("ai_tool_loop_limit");
    }

    messages.push({
      role:"assistant",
      content:providerResult.text,
      toolCalls:providerResult.toolCalls,
    });

    for (const call of providerResult.toolCalls) {
      const signature=call.name+":"+stableJson(call.arguments);
      if (seenToolRequests.has(signature)) {
        throw new Error("ai_tool_loop_detected");
      }
      seenToolRequests.add(signature);

      const tool=aiAccountantToolRegistry[
        call.name as keyof typeof aiAccountantToolRegistry
      ];
      const started=Date.now();
      const inputHash=sha256Json(call.arguments);

      if (!tool) {
        await recordAIToolRun({
          businessId:context.businessId,
          userId:context.userId,
          sessionId,
          toolName:call.name.slice(0,120),
          status:"failed",
          correlationId,
          inputHash,
          outputSummary:{},
          errorCode:"ai_tool_not_allowed",
          provider:providerResult.provider,
          model:providerResult.model,
          latencyMs:Date.now()-started,
        });
        throw new Error("ai_tool_not_allowed");
      }

      try {
        const result=await executeAIAccountantTool(
          { ...context,sessionId },
          call.name,
          call.arguments,
        );
        const source=evidenceFrom(result);
        if (source) evidence.push(source);

        await recordAIToolRun({
          businessId:context.businessId,
          userId:context.userId,
          sessionId,
          toolName:call.name,
          status:"succeeded",
          correlationId,
          inputHash,
          outputSummary:auditSummary(result),
          provider:providerResult.provider,
          model:providerResult.model,
          latencyMs:Date.now()-started,
        });

        messages.push({
          role:"tool",
          name:call.name,
          toolCallId:call.id,
          content:JSON.stringify(result),
        });
      } catch (error) {
        const code=normalizedError(error);
        await recordAIToolRun({
          businessId:context.businessId,
          userId:context.userId,
          sessionId,
          toolName:call.name,
          status:"failed",
          correlationId,
          inputHash,
          outputSummary:{},
          errorCode:code,
          provider:providerResult.provider,
          model:providerResult.model,
          latencyMs:Date.now()-started,
        }).catch(() => undefined);
        deterministicFailure=safeToolFailure(call.name,code);
        break;
      }
    }

    if (deterministicFailure) break;
    if (round === 2 && providerResult.toolCalls.length) {
      throw new Error("ai_tool_loop_limit");
    }
  }

  const answer=(deterministicFailure
    ?? lastProviderResult?.text.trim()
    ?? "").trim()
    || "I do not have enough verified Codeedge Finance data to answer that safely.";

  await appendAIMessage({
    businessId:context.businessId,
    userId:context.userId,
    sessionId,
    role:"assistant",
    content:answer,
    provider:lastProviderResult?.provider ?? provider.id,
    model:lastProviderResult?.model ?? provider.model,
  });

  return {
    sessionId,
    answer,
    provider:lastProviderResult?.provider ?? provider.id,
    model:lastProviderResult?.model ?? provider.model,
    evidence,
    proposals:await getAISessionProposals({
      businessId:context.businessId,
      userId:context.userId,
      sessionId,
      limit:20,
    }),
  };
}

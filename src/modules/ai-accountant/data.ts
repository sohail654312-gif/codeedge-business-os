import "server-only";

import type { TenantContext } from "@/server/authorization/tenant";
import {
  getAISessionMessages,
  getAISessionProposals,
  getRecentAISessions,
} from "@/server/ai/persistence";

export async function getAIAccountantHistory(input: {
  tenant: TenantContext;
  selectedSessionId?: string | null;
}) {
  const sessions=await getRecentAISessions({
    businessId:input.tenant.business.id,
    userId:input.tenant.userId,
    limit:10,
  });

  let sessionId=input.selectedSessionId ?? sessions[0]?.id ?? null;
  if (sessionId && !sessions.some((session)=>session.id===sessionId)) {
    sessionId=sessions[0]?.id ?? null;
  }

  if (!sessionId) {
    return { sessions,messages:[],proposals:[],sessionId:null };
  }

  const [messages,proposals]=await Promise.all([
    getAISessionMessages({
      businessId:input.tenant.business.id,
      userId:input.tenant.userId,
      sessionId,
      limit:30,
    }),
    getAISessionProposals({
      businessId:input.tenant.business.id,
      userId:input.tenant.userId,
      sessionId,
      limit:20,
    }),
  ]);

  return { sessions,messages,proposals,sessionId };
}

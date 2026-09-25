import "server-only";

import type { ExecutionMode } from "@/types/database";
import type { AIModelProvider, AIProviderId } from "./provider";
import { demoAIProvider } from "./demo-provider";
import { resolveOpenAICompatibleCredential } from "./credentials";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export type AIProviderRegistration = {
  id: AIProviderId;
  environments: readonly ExecutionMode[];
  externalEffect: boolean;
  structuredTools: boolean;
};

export const aiProviderRegistry: Record<AIProviderId,AIProviderRegistration> = {
  demo_ai:{
    id:"demo_ai",
    environments:["demo"],
    externalEffect:false,
    structuredTools:true,
  },
  openai_compatible:{
    id:"openai_compatible",
    environments:["sandbox","production"],
    externalEffect:true,
    structuredTools:true,
  },
};

export function getAIProviderRegistration(id: string) {
  const registration = aiProviderRegistry[id as AIProviderId];
  if (!registration) throw new Error("ai_provider_unknown");
  return registration;
}

export function getAIProviderForContext(input: {
  businessId: string;
  executionMode: ExecutionMode;
}): AIModelProvider {
  if (input.executionMode === "demo") {
    return demoAIProvider;
  }

  const credential = resolveOpenAICompatibleCredential(
    input.businessId,
    input.executionMode,
  );
  if (!credential) throw new Error("ai_provider_unavailable");

  return createOpenAICompatibleProvider(credential);
}

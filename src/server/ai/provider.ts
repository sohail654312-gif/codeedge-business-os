import type { ExecutionMode } from "@/types/database";

export type AIProviderId = "demo_ai" | "openai_compatible";

export type AIProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
};

export type AIToolDefinition = {
  name: string;
  description: string;
  inputJsonSchema: Record<string, unknown>;
};

export type AIToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type AIProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AIProviderResult = {
  text: string;
  toolCalls: AIToolCall[];
  provider: AIProviderId;
  model: string;
  providerRequestId?: string;
  usage?: AIProviderUsage;
};

export type AIProviderInput = {
  messages: AIProviderMessage[];
  tools: AIToolDefinition[];
  executionMode: ExecutionMode;
  defaultCurrency: string;
  signal?: AbortSignal;
};

export interface AIModelProvider {
  readonly id: AIProviderId;
  readonly model: string;
  generate(input: AIProviderInput): Promise<AIProviderResult>;
}

export class AIProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AIProviderError";
  }
}

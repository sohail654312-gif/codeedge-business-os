import "server-only";

import { z } from "zod";
import type { OpenAICompatibleCredential } from "./credentials";
import {
  AIProviderError,
  type AIModelProvider,
  type AIProviderInput,
  type AIProviderMessage,
  type AIToolCall,
} from "./provider";

const responseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string().min(1).max(200),
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1).max(120),
          arguments: z.string().max(12000),
        }),
      })).optional(),
    }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

function providerMessage(message: AIProviderMessage) {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function parseToolCalls(
  raw: z.infer<typeof responseSchema>["choices"][number]["message"]["tool_calls"],
): AIToolCall[] {
  return (raw ?? []).map((call) => {
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      throw new AIProviderError("ai_provider_malformed_response");
    }
    return { id:call.id,name:call.function.name,arguments:args };
  });
}

export function createOpenAICompatibleProvider(
  credential: OpenAICompatibleCredential,
  fetcher: typeof fetch = fetch,
): AIModelProvider {
  return {
    id: "openai_compatible",
    model: credential.model,

    async generate(input: AIProviderInput) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),20000);
      const abort = () => controller.abort();
      input.signal?.addEventListener("abort",abort,{ once:true });

      try {
        const response = await fetcher(credential.endpoint,{
          method:"POST",
          headers:{
            "Authorization":"Bearer "+credential.apiKey,
            "Content-Type":"application/json",
          },
          body:JSON.stringify({
            model:credential.model,
            messages:input.messages.map(providerMessage),
            tools:input.tools.map((tool) => ({
              type:"function",
              function:{
                name:tool.name,
                description:tool.description,
                parameters:tool.inputJsonSchema,
              },
            })),
            tool_choice:"auto",
            temperature:0.1,
          }),
          signal:controller.signal,
        });

        if (!response.ok) {
          throw new AIProviderError("ai_provider_unavailable");
        }

        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          throw new AIProviderError("ai_provider_malformed_response");
        }

        const parsed = responseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new AIProviderError("ai_provider_malformed_response");
        }

        const message = parsed.data.choices[0]!.message;
        return {
          text:message.content ?? "",
          toolCalls:parseToolCalls(message.tool_calls),
          provider:"openai_compatible" as const,
          model:credential.model,
          providerRequestId:response.headers.get("x-request-id")
            ?? parsed.data.id
            ?? undefined,
          usage:parsed.data.usage ? {
            inputTokens:parsed.data.usage.prompt_tokens,
            outputTokens:parsed.data.usage.completion_tokens,
            totalTokens:parsed.data.usage.total_tokens,
          } : undefined,
        };
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        if (controller.signal.aborted) {
          throw new AIProviderError("ai_provider_timeout");
        }
        throw new AIProviderError("ai_provider_unavailable");
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort",abort);
      }
    },
  };
}

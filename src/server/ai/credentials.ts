import "server-only";

import { z } from "zod";
import type { ExecutionMode } from "@/types/database";

const credentialSchema = z.object({
  businessId: z.string().uuid(),
  provider: z.literal("openai_compatible"),
  environment: z.enum(["sandbox","production"]),
  endpoint: z.string().url(),
  apiKey: z.string().min(8).max(500),
  model: z.string().trim().min(1).max(160),
}).strict();

export type OpenAICompatibleCredential = z.infer<typeof credentialSchema>;

function safeEndpoint(raw: string) {
  const url = new URL(raw);
  const local = ["localhost","127.0.0.1","[::1]"].includes(url.hostname);

  if (url.username || url.password) {
    throw new Error("ai_provider_config_invalid");
  }
  if (!local && url.protocol !== "https:") {
    throw new Error("ai_provider_config_invalid");
  }
  if (local && !["http:","https:"].includes(url.protocol)) {
    throw new Error("ai_provider_config_invalid");
  }
  if (!url.pathname.endsWith("/chat/completions")) {
    throw new Error("ai_provider_config_invalid");
  }

  return url.toString();
}

export function resolveOpenAICompatibleCredential(
  businessId: string,
  executionMode: ExecutionMode,
): OpenAICompatibleCredential | null {
  if (executionMode === "demo") return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(process.env.AI_MODEL_CREDENTIALS_JSON ?? "{}");
  } catch {
    throw new Error("ai_provider_config_invalid");
  }

  const parsed = z.record(z.string(),credentialSchema).safeParse(parsedJson);
  if (!parsed.success) throw new Error("ai_provider_config_invalid");

  const environment = executionMode === "sandbox" ? "sandbox" : "production";
  const matches = Object.values(parsed.data).filter((credential) =>
    credential.businessId === businessId
    && credential.environment === environment
  );

  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("ai_provider_config_invalid");

  return {
    ...matches[0]!,
    endpoint: safeEndpoint(matches[0]!.endpoint),
  };
}

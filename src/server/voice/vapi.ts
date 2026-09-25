import "server-only";

import { z } from "zod";
import {
  type NormalizedVoiceWebhookEvent,
  type StartOutboundVoiceCallInput,
  type StartOutboundVoiceCallResult,
  type VoiceCallStatus,
  type VoiceProvider,
  VoiceProviderError,
} from "./provider";

const callResponseSchema = z.object({
  id: z.string().min(1).max(255),
  status: z.string().min(1).max(80).optional(),
}).passthrough();

const serverMessageSchema = z.object({
  message: z.object({
    type: z.string().min(1).max(100),
    status: z.string().optional(),
    timestamp: z.string().optional(),
    call: z.object({
      id: z.string().min(1).max(255),
      type: z.string().optional(),
      customer: z.object({
        number: z.string().optional(),
      }).optional(),
      phoneNumber: z.object({
        number: z.string().optional(),
      }).optional(),
    }).passthrough(),
    artifact: z.object({
      messages: z.array(z.object({
        role: z.string(),
        message: z.string(),
      }).passthrough()).optional(),
    }).passthrough().optional(),
  }).passthrough(),
});

type VapiConfig = {
  credentialKey: string;
  assistantId: string;
  phoneNumberId: string;
};

function credentialMap() {
  const raw = process.env.VOICE_VAPI_CREDENTIALS_JSON;
  if (!raw) return {} as Record<string, unknown>;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Voice credentials configuration is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Voice credentials configuration is invalid.");
  }

  return parsed as Record<string, unknown>;
}

function privateKey(credentialKey: string) {
  const value = credentialMap()[credentialKey];
  if (typeof value !== "string" || value.length < 20) {
    throw new VoiceProviderError("voice_credential_unavailable");
  }
  return value;
}

export function vapiCredentialConfigured(
  credentialKey: string | null | undefined,
) {
  if (!credentialKey) return false;
  try {
    const value = credentialMap()[credentialKey];
    return typeof value === "string" && value.length >= 20;
  } catch {
    return false;
  }
}

export function normalizeVapiStatus(value: string | null | undefined): VoiceCallStatus {
  switch ((value ?? "").toLowerCase()) {
    case "scheduled":
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "in_progress":
      return "in_progress";
    case "ended":
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
    case "no_answer":
      return "no_answer";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "failed";
  }
}

function callDirection(value: string | undefined) {
  if (value === "inboundPhoneCall") return "inbound" as const;
  if (value === "outboundPhoneCall") return "outbound" as const;
  return null;
}

function transcriptFromArtifact(
  artifact: z.infer<typeof serverMessageSchema>["message"]["artifact"],
) {
  return (artifact?.messages ?? [])
    .filter((item) => item.message.trim())
    .flatMap((item) => {
      if (item.role === "user") {
        return [{ speaker: "caller" as const, text: item.message.trim() }];
      }
      if (item.role === "assistant") {
        return [{ speaker: "assistant" as const, text: item.message.trim() }];
      }
      return [];
    });
}

export function parseVapiServerMessage(
  payload: unknown,
): NormalizedVoiceWebhookEvent {
  const parsed = serverMessageSchema.safeParse(payload);
  if (!parsed.success) {
    throw new VoiceProviderError("vapi_invalid_webhook");
  }

  const { message } = parsed.data;
  const status = message.type === "end-of-call-report"
    ? "completed"
    : normalizeVapiStatus(message.status ?? message.type);

  const timestamp = message.timestamp && !Number.isNaN(Date.parse(message.timestamp))
    ? new Date(message.timestamp).toISOString()
    : new Date().toISOString();

  return {
    providerEventId: `${message.type}:${message.call.id}:${timestamp}`,
    providerCallId: message.call.id,
    status,
    direction: callDirection(message.call.type),
    fromNumber: message.call.customer?.number ?? null,
    toNumber: message.call.phoneNumber?.number ?? null,
    occurredAt: timestamp,
    transcript: transcriptFromArtifact(message.artifact),
  };
}

export function createVapiVoiceProvider(
  config: VapiConfig,
  fetcher: typeof fetch = fetch,
): VoiceProvider {
  return {
    metadata: {
      id: "vapi",
      environments: ["sandbox", "production"],
      capabilities: [
        "inbound_calling",
        "outbound_calling",
        "pstn",
        "realtime_transcript",
        "post_call_transcript",
        "recording",
        "transfer",
        "dtmf",
        "tool_calling",
        "multilingual",
        "custom_stt",
        "custom_tts",
      ],
      externalEffect: true,
    },

    async startOutboundCall(
      input: StartOutboundVoiceCallInput,
    ): Promise<StartOutboundVoiceCallResult> {
      if (!config.assistantId || !config.phoneNumberId) {
        throw new VoiceProviderError("vapi_configuration_invalid");
      }

      const response = await fetcher("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${privateKey(config.credentialKey)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.correlationId,
        },
        body: JSON.stringify({
          assistantId: config.assistantId,
          phoneNumberId: config.phoneNumberId,
          customer: { number: input.toNumber },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // Keep provider response bodies away from application errors/logs.
      }

      if (!response.ok) {
        throw new VoiceProviderError(`vapi_${response.status}`);
      }

      const parsed = callResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new VoiceProviderError("vapi_invalid_response");
      }

      return {
        providerCallId: parsed.data.id,
        status: normalizeVapiStatus(parsed.data.status ?? "queued"),
      };
    },

    async parseWebhook(payload) {
      return parseVapiServerMessage(payload);
    },
  };
}

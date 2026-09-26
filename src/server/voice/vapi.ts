import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type NormalizedVoiceWebhookEvent,
  type StartOutboundVoiceCallInput,
  type StartOutboundVoiceCallResult,
  type VoiceCallStatus,
  type VoiceProvider,
  VoiceProviderError,
} from "./provider";
import { voiceProviderMetadata } from "./provider-metadata";

const callResponseSchema = z.object({
  id: z.string().min(1).max(255),
  status: z.string().min(1).max(80).optional(),
}).passthrough();

const serverMessageSchema = z.object({
  message: z.object({
    id: z.string().min(1).max(255).optional(),
    eventId: z.string().min(1).max(255).optional(),
    type: z.string().min(1).max(100),
    status: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    call: z.object({
      id: z.string().min(1).max(255),
      type: z.string().optional(),
      customer: z.object({
        number: z.string().optional(),
      }).optional(),
      phoneNumber: z.object({
        number: z.string().optional(),
      }).optional(),
      phoneNumberId: z.string().optional(),
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

function normalizedProviderTimestamp(value: string | number | undefined) {
  if (value === undefined) return null;
  const parsed = typeof value === "number"
    ? new Date(value)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deterministicVapiEventId(input: {
  stableProviderEventId?: string;
  messageType: string;
  providerCallId: string;
  providerStatus: VoiceCallStatus;
  callDirection: "inbound" | "outbound" | null;
  providerConnectionRef: string | null;
  providerTimestamp: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  transcript: Array<{ speaker: "caller" | "assistant"; text: string }>;
}) {
  if (input.stableProviderEventId) {
    return `vapi:event:${input.stableProviderEventId}`;
  }

  const fingerprint = JSON.stringify({
    provider: "vapi",
    messageType: input.messageType,
    providerCallId: input.providerCallId,
    providerStatus: input.providerStatus,
    callDirection: input.callDirection,
    providerConnectionRef: input.providerConnectionRef,
    providerTimestamp: input.providerTimestamp,
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    transcript: input.transcript,
  });

  return `vapi:sha256:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function transcriptFromArtifact(
  artifact: z.infer<typeof serverMessageSchema>["message"]["artifact"],
): Array<{ speaker: "caller" | "assistant"; text: string }> {
  const transcript: Array<{
    speaker: "caller" | "assistant";
    text: string;
  }> = [];

  for (const item of artifact?.messages ?? []) {
    const text = item.message.trim();
    if (!text) continue;
    if (item.role === "user") {
      transcript.push({ speaker: "caller", text });
    } else if (item.role === "assistant") {
      transcript.push({ speaker: "assistant", text });
    }
  }

  return transcript;
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

  const providerTimestamp = normalizedProviderTimestamp(message.timestamp);
  const direction = callDirection(message.call.type);
  const providerConnectionRef = message.call.phoneNumberId ?? null;
  const fromNumber = message.call.customer?.number ?? null;
  const toNumber = message.call.phoneNumber?.number ?? null;
  const transcript = transcriptFromArtifact(message.artifact);

  return {
    providerEventId: deterministicVapiEventId({
      stableProviderEventId: message.eventId ?? message.id,
      messageType: message.type,
      providerCallId: message.call.id,
      providerStatus: status,
      callDirection: direction,
      providerConnectionRef,
      providerTimestamp,
      fromNumber,
      toNumber,
      transcript,
    }),
    providerCallId: message.call.id,
    providerConnectionRef,
    status,
    direction,
    fromNumber,
    toNumber,
    occurredAt: providerTimestamp ?? new Date().toISOString(),
    transcript,
  };
}

export function createVapiVoiceProvider(
  config: VapiConfig,
  fetcher: typeof fetch = fetch,
): VoiceProvider {
  return {
    metadata: voiceProviderMetadata.vapi,

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

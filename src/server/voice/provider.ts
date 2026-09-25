import "server-only";

export const voiceProviderCapabilityNames = [
  "inbound_calling",
  "outbound_calling",
  "sip",
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
  "sandbox",
] as const;

export type VoiceProviderCapability =
  (typeof voiceProviderCapabilityNames)[number];

export type VoiceProviderId = "demo_voice" | "vapi";

export type VoiceProviderEnvironment =
  | "demo"
  | "sandbox"
  | "production";

export type VoiceCallDirection = "inbound" | "outbound";

export const normalizedVoiceCallStatuses = [
  "queued",
  "ringing",
  "in_progress",
  "completed",
  "failed",
  "no_answer",
  "busy",
  "cancelled",
] as const;

export type VoiceCallStatus =
  (typeof normalizedVoiceCallStatuses)[number];

export type VoiceProviderMetadata = {
  id: VoiceProviderId;
  environments: readonly VoiceProviderEnvironment[];
  capabilities: readonly VoiceProviderCapability[];
  externalEffect: boolean;
};

export type StartOutboundVoiceCallInput = {
  correlationId: string;
  fromNumber: string;
  toNumber: string;
  webhookUrl: string;
  metadata?: Record<string, string>;
};

export type StartOutboundVoiceCallResult = {
  providerCallId: string;
  status: VoiceCallStatus;
};

export type NormalizedVoiceWebhookEvent = {
  providerEventId: string;
  providerCallId: string;
  providerConnectionRef: string | null;
  status: VoiceCallStatus;
  direction: VoiceCallDirection | null;
  fromNumber: string | null;
  toNumber: string | null;
  occurredAt: string;
  transcript?: readonly {
    speaker: "caller" | "assistant";
    text: string;
    occurredAt?: string;
  }[];
};

export interface VoiceProvider {
  readonly metadata: VoiceProviderMetadata;

  startOutboundCall?(
    input: StartOutboundVoiceCallInput,
  ): Promise<StartOutboundVoiceCallResult>;

  parseWebhook?(
    payload: unknown,
    headers: Headers,
  ): Promise<NormalizedVoiceWebhookEvent>;

  terminateCall?(providerCallId: string): Promise<void>;
}

export class VoiceProviderError extends Error {
  readonly code: string;

  constructor(code: string, message = "Voice provider operation failed.") {
    super(message);
    this.name = "VoiceProviderError";
    this.code = code;
  }
}

export function providerSupports(
  provider: Pick<VoiceProvider, "metadata">,
  capability: VoiceProviderCapability,
) {
  return provider.metadata.capabilities.includes(capability);
}

export function requireVoiceCapability(
  provider: Pick<VoiceProvider, "metadata">,
  capability: VoiceProviderCapability,
) {
  if (!providerSupports(provider, capability)) {
    throw new VoiceProviderError(
      "voice_provider_capability_unsupported",
      `Voice provider does not support ${capability}.`,
    );
  }
}

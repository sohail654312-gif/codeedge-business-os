import "server-only";

import {
  type NormalizedVoiceWebhookEvent,
  type StartOutboundVoiceCallInput,
  type StartOutboundVoiceCallResult,
  type VoiceProvider,
  VoiceProviderError,
} from "./provider";
import { voiceProviderMetadata } from "./provider-metadata";

export class DemoVoiceProvider implements VoiceProvider {
  readonly metadata = voiceProviderMetadata.demo_voice;

  async startOutboundCall(
    input: StartOutboundVoiceCallInput,
  ): Promise<StartOutboundVoiceCallResult> {
    if (!input.correlationId || !input.toNumber) {
      throw new VoiceProviderError("demo_voice_invalid_request");
    }

    return {
      providerCallId: `demo:${input.correlationId}`,
      status: "in_progress",
    };
  }

  async parseWebhook(
    payload: unknown,
  ): Promise<NormalizedVoiceWebhookEvent> {
    if (!payload || typeof payload !== "object") {
      throw new VoiceProviderError("demo_voice_invalid_event");
    }

    const event = payload as Record<string, unknown>;
    const providerEventId = typeof event.providerEventId === "string"
      ? event.providerEventId
      : "";
    const providerCallId = typeof event.providerCallId === "string"
      ? event.providerCallId
      : "";

    if (!providerEventId || !providerCallId) {
      throw new VoiceProviderError("demo_voice_invalid_event");
    }

    return {
      providerEventId,
      providerCallId,
      providerConnectionRef: null,
      status: "completed",
      direction: "inbound",
      fromNumber: null,
      toNumber: null,
      occurredAt: new Date().toISOString(),
    };
  }
}

export function createDemoVoiceProvider() {
  return new DemoVoiceProvider();
}

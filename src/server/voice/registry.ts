import "server-only";

import { createDemoVoiceProvider } from "./demo";
import type {
  VoiceProvider,
  VoiceProviderId,
  VoiceProviderMetadata,
} from "./provider";

export type VoiceProviderRegistration = VoiceProviderMetadata & {
  implemented: boolean;
};

export const voiceProviderRegistry: Record<
  VoiceProviderId,
  VoiceProviderRegistration
> = {
  demo_voice: {
    id: "demo_voice",
    environments: ["demo"],
    capabilities: [
      "inbound_calling",
      "outbound_calling",
      "post_call_transcript",
      "tool_calling",
      "multilingual",
      "sandbox",
    ],
    externalEffect: false,
    implemented: true,
  },
  vapi: {
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
    implemented: false,
  },
};

export function getVoiceProviderRegistration(
  providerId: string,
): VoiceProviderRegistration {
  if (providerId === "demo_voice" || providerId === "vapi") {
    return voiceProviderRegistry[providerId];
  }
  throw new Error("Unsupported Voice provider.");
}

export function getVoiceProvider(providerId: string): VoiceProvider {
  if (providerId === "demo_voice") return createDemoVoiceProvider();

  // The first real provider stays behind the registry until its server-only
  // credential/configuration path is installed. Failing closed here prevents
  // accidental network effects while preserving the provider-neutral contract.
  throw new Error("Voice provider adapter is not configured.");
}

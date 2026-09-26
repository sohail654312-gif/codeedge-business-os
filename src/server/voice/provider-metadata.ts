import type {
  VoiceProviderId,
  VoiceProviderMetadata,
} from "./provider";

export const voiceProviderMetadata = {
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
  },
} as const satisfies Record<VoiceProviderId, VoiceProviderMetadata>;

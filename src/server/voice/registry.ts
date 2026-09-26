import "server-only";

import { createDemoVoiceProvider } from "./demo";
import { createVapiVoiceProvider } from "./vapi";
import type {
  VoiceProvider,
  VoiceProviderId,
  VoiceProviderMetadata,
} from "./provider";
import { voiceProviderMetadata } from "./provider-metadata";

export type VoiceProviderRegistration = VoiceProviderMetadata & {
  implemented: boolean;
};

export type VoiceProviderConnectionConfig = {
  businessId: string;
  providerEnvironment: "sandbox" | "production";
  credentialKey: string;
  assistantId: string;
  phoneNumberId: string;
};

export const voiceProviderRegistry: Record<
  VoiceProviderId,
  VoiceProviderRegistration
> = {
  demo_voice: {
    ...voiceProviderMetadata.demo_voice,
    implemented: true,
  },
  vapi: {
    ...voiceProviderMetadata.vapi,
    implemented: true,
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

export function getVoiceProvider(
  providerId: string,
  config?: VoiceProviderConnectionConfig,
): VoiceProvider {
  if (providerId === "demo_voice") return createDemoVoiceProvider();
  if (providerId === "vapi" && config) return createVapiVoiceProvider(config);

  throw new Error("Voice provider adapter is not configured.");
}

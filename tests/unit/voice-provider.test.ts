import { describe, expect, it } from "vitest";
import { createDemoVoiceProvider } from "@/server/voice/demo";
import {
  getVoiceProvider,
  getVoiceProviderRegistration,
  voiceProviderRegistry,
} from "@/server/voice/registry";
import {
  providerSupports,
  requireVoiceCapability,
  VoiceProviderError,
} from "@/server/voice/provider";

describe("Voice provider boundary", () => {
  it("keeps Demo Voice internal and external-effect free", () => {
    const demo = createDemoVoiceProvider();

    expect(demo.metadata.id).toBe("demo_voice");
    expect(demo.metadata.externalEffect).toBe(false);
    expect(demo.metadata.environments).toEqual(["demo"]);
    expect(providerSupports(demo, "outbound_calling")).toBe(true);
    expect(providerSupports(demo, "recording")).toBe(false);
  });

  it("fails explicitly when a requested capability is unavailable", () => {
    const demo = createDemoVoiceProvider();

    expect(() => requireVoiceCapability(demo, "recording"))
      .toThrowError(VoiceProviderError);
  });

  it("simulates an outbound call without a live provider", async () => {
    const demo = createDemoVoiceProvider();

    await expect(demo.startOutboundCall?.({
      correlationId: "80000000-0000-4000-8000-000000000001",
      fromNumber: "demo:clinic",
      toNumber: "demo:caller",
      webhookUrl: "https://example.test/internal/demo-voice",
    })).resolves.toEqual({
      providerCallId: "demo:80000000-0000-4000-8000-000000000001",
      status: "in_progress",
    });
  });

  it("registers the first real provider as a replaceable adapter, not the domain", () => {
    expect(voiceProviderRegistry.vapi.externalEffect).toBe(true);
    expect(voiceProviderRegistry.vapi.implemented).toBe(false);
    expect(getVoiceProviderRegistration("vapi").capabilities)
      .toContain("tool_calling");
  });

  it("fails closed if a real adapter is not yet configured", () => {
    expect(() => getVoiceProvider("vapi"))
      .toThrow(/not configured/i);
  });

  it("rejects an unknown provider", () => {
    expect(() => getVoiceProviderRegistration("unknown"))
      .toThrow(/unsupported/i);
  });
});

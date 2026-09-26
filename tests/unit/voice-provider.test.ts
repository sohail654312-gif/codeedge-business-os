import { describe, expect, it, vi } from "vitest";
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
import {
  createVapiVoiceProvider,
  normalizeVapiStatus,
  parseVapiServerMessage,
} from "@/server/voice/vapi";

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

  it("registers Vapi as one replaceable real adapter", () => {
    expect(voiceProviderRegistry.vapi.externalEffect).toBe(true);
    expect(voiceProviderRegistry.vapi.implemented).toBe(true);
    expect(getVoiceProviderRegistration("vapi").capabilities)
      .toContain("tool_calling");
  });

  it("fails closed if a real adapter is requested without connection config", () => {
    expect(() => getVoiceProvider("vapi"))
      .toThrow(/not configured/i);
  });

  it("normalizes provider lifecycle states", () => {
    expect(normalizeVapiStatus("queued")).toBe("queued");
    expect(normalizeVapiStatus("ringing")).toBe("ringing");
    expect(normalizeVapiStatus("in-progress")).toBe("in_progress");
    expect(normalizeVapiStatus("ended")).toBe("completed");
    expect(normalizeVapiStatus("unknown")).toBe("failed");
  });

  it("normalizes Vapi end-of-call transcript messages", () => {
    const event = parseVapiServerMessage({
      message: {
        type: "end-of-call-report",
        timestamp: "2026-09-25T10:00:00Z",
        call: {
          id: "call-1",
          type: "inboundPhoneCall",
          customer: { number: "+447700900123" },
          phoneNumber: { number: "+441234567890" },
        },
        artifact: {
          messages: [
            { role: "assistant", message: "Hello, how can I help?" },
            { role: "user", message: "I need an appointment." },
          ],
        },
      },
    });

    expect(event).toMatchObject({
      providerCallId: "call-1",
      status: "completed",
      direction: "inbound",
      fromNumber: "+447700900123",
      toNumber: "+441234567890",
    });
    expect(event.transcript).toEqual([
      { speaker: "assistant", text: "Hello, how can I help?" },
      { speaker: "caller", text: "I need an appointment." },
    ]);
  });

  it("keeps the same Vapi event identity for retries with a provider timestamp", () => {
    const payload = {
      message: {
        type: "status-update",
        status: "ringing",
        timestamp: "2026-09-25T10:00:00Z",
        call: {
          id: "call-stable-timestamp",
          type: "inboundPhoneCall",
          phoneNumberId: "phone-a",
          customer: { number: "+447700900123" },
          phoneNumber: { number: "+441234567890" },
        },
      },
    };

    const first = parseVapiServerMessage(payload);
    const retry = parseVapiServerMessage(payload);

    expect(retry.providerEventId).toBe(first.providerEventId);
  });

  it("keeps the same Vapi event identity for retries without a provider timestamp", () => {
    const payload = {
      message: {
        type: "end-of-call-report",
        call: {
          id: "call-no-timestamp",
          type: "inboundPhoneCall",
          phoneNumberId: "phone-a",
          customer: { number: "+447700900123" },
          phoneNumber: { number: "+441234567890" },
        },
        artifact: {
          messages: [
            { role: "assistant", message: "How can I help?" },
            { role: "user", message: "Please book me in." },
          ],
        },
      },
    };

    const first = parseVapiServerMessage(payload);
    const retry = parseVapiServerMessage(payload);

    expect(retry.providerEventId).toBe(first.providerEventId);
    expect(first.providerEventId).toMatch(/^vapi:sha256:[a-f0-9]{64}$/);
  });

  it("changes deterministic event identity when material provider payload changes", () => {
    const base = {
      message: {
        type: "status-update",
        status: "ringing",
        call: {
          id: "call-material-change",
          type: "inboundPhoneCall",
          phoneNumberId: "phone-a",
          customer: { number: "+447700900123" },
          phoneNumber: { number: "+441234567890" },
        },
      },
    };

    const changed = {
      message: {
        ...base.message,
        status: "in-progress",
      },
    };

    expect(parseVapiServerMessage(changed).providerEventId)
      .not.toBe(parseVapiServerMessage(base).providerEventId);
  });

  it("prefers a stable Vapi provider event identifier when one is present", () => {
    const event = parseVapiServerMessage({
      message: {
        id: "provider-event-123",
        type: "status-update",
        status: "ringing",
        call: {
          id: "call-provider-id",
          type: "inboundPhoneCall",
          phoneNumberId: "phone-a",
        },
      },
    });

    expect(event.providerEventId).toBe("vapi:event:provider-event-123");
  });

  it("uses a server-only Vapi credential and never performs a real network call in tests", async () => {
    process.env.VOICE_VAPI_CREDENTIALS_JSON = JSON.stringify({
      voice_primary: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "vapi",
        environment: "production",
        assistantId: "assistant-test",
        phoneNumberId: "phone-test",
        secret: "test_private_key_12345678901234567890",
      },
    });

    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({ id: "call-test", status: "queued" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const provider = createVapiVoiceProvider({
      businessId: "20000000-0000-4000-8000-000000000001",
      providerEnvironment: "production",
      credentialKey: "voice_primary",
      assistantId: "assistant-test",
      phoneNumberId: "phone-test",
    }, fetcher as typeof fetch);

    await expect(provider.startOutboundCall?.({
      correlationId: "80000000-0000-4000-8000-000000000001",
      fromNumber: "+441234567890",
      toNumber: "+447700900123",
      webhookUrl: "https://example.test/api/voice/vapi",
    })).resolves.toEqual({
      providerCallId: "call-test",
      status: "queued",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(capturedInit).toBeDefined();
    expect(String(
      (capturedInit?.headers as Record<string, string>).Authorization,
    )).toMatch(/^Bearer /);
  });

  it("denies a Vapi alias for a different trusted tenant", async () => {
    process.env.VOICE_VAPI_CREDENTIALS_JSON = JSON.stringify({
      tenant_a: {
        businessId: "20000000-0000-4000-8000-000000000001",
        provider: "vapi",
        environment: "production",
        assistantId: "assistant-test",
        phoneNumberId: "phone-test",
        secret: "test_private_key_12345678901234567890",
      },
    });
    const fetcher = vi.fn();
    const provider = createVapiVoiceProvider({
      businessId: "20000000-0000-4000-8000-000000000002",
      providerEnvironment: "production",
      credentialKey: "tenant_a",
      assistantId: "assistant-test",
      phoneNumberId: "phone-test",
    }, fetcher as typeof fetch);

    await expect(provider.startOutboundCall?.({
      correlationId: "80000000-0000-4000-8000-000000000009",
      fromNumber: "+441234567890",
      toNumber: "+447700900123",
      webhookUrl: "https://example.test/api/voice/vapi",
    })).rejects.toThrow(/credential/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider", () => {
    expect(() => getVoiceProviderRegistration("unknown"))
      .toThrow(/unsupported/i);
  });
});

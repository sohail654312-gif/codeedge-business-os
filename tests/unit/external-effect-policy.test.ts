import { describe, expect, it } from "vitest";
import {
  assertCommunicationExternalEffectAllowed,
  type CommunicationExecutionContext,
} from "@/server/channels/execution";
import {
  assertExternalEffectAllowed,
  ExternalEffectBlockedError,
  type ExternalEffectContext,
} from "@/server/execution/external-effects";

function codeFrom(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ExternalEffectBlockedError);
    return (error as ExternalEffectBlockedError).code;
  }
  throw new Error("Expected external-effect policy to block.");
}

const liveProviders = [
  ["whatsapp", "meta_whatsapp_cloud"],
  ["email", "resend_email"],
  ["sms", "twilio_sms"],
] as const;

function context(
  channel: CommunicationExecutionContext["channel"],
  provider: string,
  overrides: Partial<CommunicationExecutionContext> = {},
): CommunicationExecutionContext {
  return {
    businessId: "20000000-0000-4000-8000-000000000001",
    executionMode: "production",
    action: "communication.send",
    channel,
    provider,
    providerEnvironment: "production",
    correlationId: "80000000-0000-4000-8000-000000000001",
    simulated: false,
    ...overrides,
  };
}

describe("central external-effect safety policy", () => {
  it.each(liveProviders)(
    "blocks Demo workspace from the live %s provider",
    (channel, provider) => {
      expect(codeFrom(() => assertCommunicationExternalEffectAllowed(
        context(channel, provider, { executionMode: "demo" }),
      ))).toBe("external_effect_demo_live_blocked");
    },
  );

  it("blocks Sandbox workspace from production credential environment", () => {
    expect(codeFrom(() => assertCommunicationExternalEffectAllowed(
      context("sms", "twilio_sms", {
        executionMode: "sandbox",
        providerEnvironment: "production",
      }),
    ))).toBe("external_effect_sandbox_production_blocked");
  });

  it("requires an explicitly approved sandbox-capable provider registration", () => {
    expect(codeFrom(() => assertCommunicationExternalEffectAllowed(
      context("sms", "twilio_sms", {
        executionMode: "sandbox",
        providerEnvironment: "sandbox",
      }),
    ))).toBe("external_effect_provider_environment_unsupported");
  });

  it.each(liveProviders)(
    "preserves production path for %s",
    (channel, provider) => {
      expect(assertCommunicationExternalEffectAllowed(context(channel, provider)))
        .toMatchObject({
          executionMode: "production",
          providerEnvironment: "production",
          channel,
          provider,
        });
    },
  );

  it("fails closed for invalid/unknown workspace mode", () => {
    const invalid = {
      businessId: "20000000-0000-4000-8000-000000000001",
      executionMode: "unknown",
      action: "communication.send",
      provider: "twilio_sms",
      providerEnvironment: "production",
      correlationId: null,
      simulated: false,
    } as unknown as ExternalEffectContext;

    expect(codeFrom(() => assertExternalEffectAllowed(invalid)))
      .toBe("external_effect_invalid_context");
  });

  it("blocks a simulated effect from accidentally reaching live rails", () => {
    expect(codeFrom(() => assertCommunicationExternalEffectAllowed(
      context("email", "resend_email", { simulated: true }),
    ))).toBe("external_effect_simulated_live_blocked");
  });

  it("fails closed for an unknown provider", () => {
    expect(codeFrom(() => assertCommunicationExternalEffectAllowed(
      context("sms", "unknown_provider"),
    ))).toBe("external_effect_unknown_provider");
  });
});

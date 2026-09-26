import { describe, expect, it } from "vitest";
import { resolveTenantBoundSecret } from "@/server/credentials/tenant-bound";

const tenantA = "20000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";

const structured = JSON.stringify({
  shared_alias: {
    businessId: tenantA,
    provider: "meta_whatsapp_cloud",
    environment: "production",
    externalSenderId: "109876543210",
    secret: "test-secret-value-that-is-long-enough",
  },
});

function resolve(overrides: Partial<{
  businessId: string;
  provider: string;
  environment: "sandbox" | "production";
  externalSenderId: string;
  credentialKey: string;
  raw: string;
}> = {}) {
  return resolveTenantBoundSecret({
    raw: overrides.raw ?? structured,
    credentialKey: overrides.credentialKey ?? "shared_alias",
    label: "Test provider",
    minimumSecretLength: 20,
    expected: {
      businessId: overrides.businessId ?? tenantA,
      provider: overrides.provider ?? "meta_whatsapp_cloud",
      environment: overrides.environment ?? "production",
      expectedMetadata: {
        externalSenderId: overrides.externalSenderId ?? "109876543210",
      },
    },
  });
}

describe("tenant-bound provider credential resolution", () => {
  it("allows Tenant A to use Tenant A's matching credential", () => {
    expect(resolve()).toBe("test-secret-value-that-is-long-enough");
  });

  it("denies Tenant A from using Tenant B's known alias metadata", () => {
    expect(() => resolve({ businessId: tenantB })).toThrow(/credential is unavailable/i);
  });

  it("denies the wrong provider", () => {
    expect(() => resolve({ provider: "twilio_sms" })).toThrow(/credential is unavailable/i);
  });

  it("denies the wrong environment", () => {
    expect(() => resolve({ environment: "sandbox" })).toThrow(/credential is unavailable/i);
  });

  it("denies the wrong expected sender or account metadata", () => {
    expect(() => resolve({ externalSenderId: "999999999999" }))
      .toThrow(/credential is unavailable/i);
  });

  it("fails closed for a missing credential", () => {
    expect(() => resolve({ credentialKey: "missing" }))
      .toThrow(/credential is unavailable/i);
  });

  it("fails closed for the legacy alias-to-raw-secret format", () => {
    expect(() => resolve({
      raw: JSON.stringify({ shared_alias: "legacy-raw-secret-value" }),
    })).toThrow(/credential is unavailable/i);
  });
});

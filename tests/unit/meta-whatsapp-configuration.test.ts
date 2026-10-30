import { afterEach, describe, expect, it, vi } from "vitest";
import { metaConfigurationReady } from "@/server/channels/meta-configuration";
import { GET } from "@/app/api/channels/whatsapp/meta/health/route";

const credentials = {
  clinic_test: {
    businessId: "20000000-0000-4000-8000-000000000001",
    provider: "meta_whatsapp_cloud",
    environment: "sandbox",
    externalSenderId: "123456789012345",
    externalAccountId: "98765432109876",
    secret: "synthetic-meta-test-token-not-real",
  },
};

function fixture(overrides: Record<string, string | undefined> = {}) {
  return {
    COMMUNICATION_DATABASE_URL: "postgres://synthetic-restricted-role@127.0.0.1:6543/synthetic",
    WHATSAPP_META_APP_SECRET: "synthetic-app-secret-that-is-long",
    WHATSAPP_META_VERIFY_TOKEN: "synthetic-verify-token-that-is-long",
    WHATSAPP_META_GRAPH_API_VERSION: "v26.0",
    WHATSAPP_META_CREDENTIALS_JSON: JSON.stringify(credentials),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("Meta WhatsApp configuration preflight", () => {
  it("accepts structurally valid sandbox credentials without contacting Meta", () => {
    expect(metaConfigurationReady(fixture())).toBe(true);
  });

  it.each([
    "COMMUNICATION_DATABASE_URL",
    "WHATSAPP_META_APP_SECRET",
    "WHATSAPP_META_VERIFY_TOKEN",
    "WHATSAPP_META_GRAPH_API_VERSION",
    "WHATSAPP_META_CREDENTIALS_JSON",
  ])("fails closed if %s is absent", key => {
    expect(metaConfigurationReady(fixture({ [key]: undefined }))).toBe(false);
  });

  it("rejects versions, secrets and JSON that are present but unusable", () => {
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_GRAPH_API_VERSION: "latest" }))).toBe(false);
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_VERIFY_TOKEN: "short" }))).toBe(false);
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_APP_SECRET: "short" }))).toBe(false);
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_CREDENTIALS_JSON: "{}" }))).toBe(false);
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_CREDENTIALS_JSON: "not-json" }))).toBe(false);
  });

  it("rejects legacy raw token aliases and wrong provider or tenant-bound metadata", () => {
    expect(metaConfigurationReady(fixture({ WHATSAPP_META_CREDENTIALS_JSON: JSON.stringify({ clinic_test: "raw-token" }) }))).toBe(false);
    for (const invalid of [
      { provider: "resend_email" },
      { businessId: "not-a-uuid" },
      { environment: "demo" },
      { externalSenderId: "not-digits" },
      { externalAccountId: "invalid" },
      { secret: "too-short" },
    ]) {
      expect(metaConfigurationReady(fixture({
        WHATSAPP_META_CREDENTIALS_JSON: JSON.stringify({
          clinic_test: { ...credentials.clinic_test, ...invalid },
        }),
      }))).toBe(false);
    }
  });

  it("keeps the public health response redacted and never claims live connection", async () => {
    const env = fixture();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "configured", liveConnectionVerified: false });
    vi.stubEnv("WHATSAPP_META_CREDENTIALS_JSON", "{");
    const unavailable = GET();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "not_configured", liveConnectionVerified: false });
  });
});

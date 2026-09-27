import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  resolve: vi.fn(),
  verify: vi.fn(),
  ingest: vi.fn(),
}));

vi.mock("@/server/voice/vapi", () => ({
  parseVapiServerMessage: mocks.parse,
}));

vi.mock("@/server/voice/inbound", () => ({
  resolveVoiceConnection: mocks.resolve,
  verifyVoiceWebhookBearer: mocks.verify,
  ingestVoiceProviderEvent: mocks.ingest,
}));

import { POST } from "@/app/api/channels/voice/vapi/webhook/route";

describe("Vapi webhook retry semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parse.mockReturnValue({
      providerConnectionRef: "voice-primary",
      providerEventId: "vapi:event:test",
    });
    mocks.resolve.mockResolvedValue({ id: "connection-test" });
    mocks.verify.mockReturnValue(true);
  });

  it("returns retryable 503 after a trusted event hits a transient ingest failure", async () => {
    mocks.ingest.mockRejectedValue(new Error("database temporarily unavailable"));

    const response = await POST(new Request(
      "https://example.test/api/channels/voice/vapi/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test",
        },
        body: JSON.stringify({ message: { type: "status-update" } }),
      },
    ));

    expect(response.status).toBe(503);
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
  });

  it("keeps malformed provider input as a non-retryable 400", async () => {
    mocks.parse.mockImplementation(() => {
      throw new Error("invalid payload");
    });

    const response = await POST(new Request(
      "https://example.test/api/channels/voice/vapi/webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    ));

    expect(response.status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
});

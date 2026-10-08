import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/channels/whatsapp/media/[messageId]/route";

const state = vi.hoisted(() => ({
  businessId: "20000000-0000-4000-8000-000000000001",
  mode: "production" as "production" | "sandbox" | "demo",
  config: null as Record<string, unknown> | null,
  download: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: async () => ({ context: {
    business: { id: state.businessId, execution_mode: state.mode },
    userId: "10000000-0000-4000-8000-000000000001",
  } }),
}));
vi.mock("@/server/channels/capability", () => ({
  withCommunicationCapability: async (work: (db: { query: typeof state.query }) => unknown) => work({ query: state.query }),
}));
vi.mock("@/server/channels/registry", async original => ({
  ...await original<typeof import("@/server/channels/registry")>(),
  getTextCommunicationProvider: () => ({ downloadMedia: state.download }),
}));

function get(id = "90000000-0000-4000-8000-000000000001") {
  return GET(new NextRequest("https://codeedge.test/api/channels/whatsapp/media/" + id), { params: Promise.resolve({ messageId: id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.mode = "production";
  state.config = { businessId: state.businessId, externalSenderId: "109876543210", credentialKey: "tenant_a", providerEnvironment: "production", mediaId: "12345", mimeType: "audio/ogg" };
  state.query.mockImplementation(async () => ({ rows: [{ config: state.config }] }));
  state.download.mockResolvedValue({ bytes: new Uint8Array([1, 2]), mimeType: "audio/ogg" });
});

describe("private WhatsApp media boundary", () => {
  it("downloads only the actor-scoped stored media with private response headers", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(state.query).toHaveBeenCalledWith(expect.stringContaining("whatsapp_media_context"), [state.businessId, "10000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000001"]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
  it("rejects invalid message identifiers before accessing storage", async () => {
    expect((await get("12345")).status).toBe(404);
    expect(state.query).not.toHaveBeenCalled();
  });
  it("does not download a missing or inaccessible message", async () => {
    state.config = null;
    expect((await get()).status).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("rejects a mismatched tenant context before contacting Meta", async () => {
    state.config!.businessId = "20000000-0000-4000-8000-000000000002";
    expect((await get()).status).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("blocks live media downloads from Demo", async () => {
    state.mode = "demo";
    expect((await get()).status).toBe(503);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("blocks sandbox credentials in a Production workspace", async () => {
    state.config!.providerEnvironment = "sandbox";
    expect((await get()).status).toBe(503);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("permits matching sandbox workspace and credential classification", async () => {
    state.mode = "sandbox";
    state.config!.providerEnvironment = "sandbox";
    expect((await get()).status).toBe(200);
  });
  it("fails closed on MIME disagreement without exposing provider detail", async () => {
    state.download.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "application/pdf" });
    expect((await get()).status).toBe(503);
  });
});

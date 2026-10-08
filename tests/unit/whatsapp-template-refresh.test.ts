import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshWhatsAppTemplates } from "@/server/channels/whatsapp";

const state = vi.hoisted(() => ({
  businessId: "20000000-0000-4000-8000-000000000001",
  mode: "production" as "production" | "demo",
  saved: true,
  list: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/server/channels/capability", () => ({
  withCommunicationCapability: async (work: (db: { query: typeof state.query }) => unknown) => work({ query: state.query }),
}));
vi.mock("@/server/channels/registry", async original => ({
  ...await original<typeof import("@/server/channels/registry")>(),
  getTextCommunicationProvider: () => ({ listTemplates: state.list }),
}));
const user = "10000000-0000-4000-8000-000000000001";
const templates = [{ name: "followup", language: "en_US", category: "UTILITY", status: "APPROVED", body: "Confirmed follow-up." }];

beforeEach(() => {
  vi.clearAllMocks(); state.mode = "production"; state.saved = true;
  state.list.mockResolvedValue(templates);
  state.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.includes("whatsapp_connection_context")) return { rows: [{ config: {
      business_id: state.businessId, external_sender_id: "109876543210", external_account_id: "123456", credential_key: "tenant_a", credential_environment: "production", execution_mode: state.mode,
    } }] };
    // node-postgres treats JavaScript arrays as PostgreSQL arrays, not JSON.
    if (typeof args[4] !== "string") throw new Error("invalid input syntax for type json");
    expect(JSON.parse(args[4])).toEqual(templates);
    return { rows: [{ saved: state.saved }] };
  });
});

describe("Meta approval refresh persistence", () => {
  it("persists the approval list as JSON using the server-scoped connection identity", async () => {
    expect(await refreshWhatsAppTemplates(state.businessId, user)).toBe(1);
    expect(state.query.mock.calls[1][1].slice(0, 4)).toEqual([state.businessId, user, "109876543210", "123456"]);
    expect(state.list).toHaveBeenCalledWith(expect.objectContaining({ businessId: state.businessId, accountId: "123456", externalSenderId: "109876543210", credentialKey: "tenant_a" }));
  });
  it("does not contact Meta from a Demo workspace", async () => {
    state.mode = "demo";
    await expect(refreshWhatsAppTemplates(state.businessId, user)).rejects.toThrow();
    expect(state.list).not.toHaveBeenCalled();
  });
  it("fails closed if the connection changes during refresh", async () => {
    state.saved = false;
    await expect(refreshWhatsAppTemplates(state.businessId, user)).rejects.toThrow("Connection changed");
  });
});

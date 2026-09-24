import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveWhatsAppSettings } from "@/modules/whatsapp/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const connectionId = "70000000-0000-4000-8000-000000000001";

function tenant(role: "owner" | "staff", existing = false) {
  const calls: Array<{ operation?: string; values?: Record<string, unknown>; filters: unknown[][] }> = [];

  const from = vi.fn((table: string) => {
    expect(table).toBe("channel_connections");
    const call = { operation: undefined as string | undefined, values: undefined as Record<string, unknown> | undefined, filters: [] as unknown[][] };
    calls.push(call);

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        call.filters.push(args);
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({ data: existing ? { id: connectionId } : null, error: null })),
      single: vi.fn(async () => ({ data: { id: connectionId }, error: null })),
      insert: vi.fn((values: Record<string, unknown>) => {
        call.operation = "insert";
        call.values = values;
        return chain;
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        call.operation = "update";
        call.values = values;
        return chain;
      }),
    };

    return chain;
  });

  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: { from },
    context: {
      userId: "10000000-0000-4000-8000-000000000001",
      role,
      business: {
        id: own,
        name: "Business A",
        slug: "business-a",
        status: "active",
        timezone: "Europe/London",
        created_at: "2026-09-24T00:00:00Z",
        updated_at: "2026-09-24T00:00:00Z",
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);

  return calls;
}

function form() {
  const value = new FormData();
  value.set("enabled", "on");
  value.set("external_account_id", "123456");
  value.set("external_sender_id", "109876543210");
  value.set("display_address", "+44 20 0000 0000");
  value.set("credential_key", "client_primary");
  value.set("business_id", other);
  value.set("provider", "attacker_provider");
  return value;
}

beforeEach(() => vi.clearAllMocks());

describe("WhatsApp settings action", () => {
  it("derives tenant/channel/provider server-side on insert", async () => {
    const calls = tenant("owner");
    await expect(saveWhatsAppSettings({}, form())).resolves.toHaveProperty("success");

    const insert = calls.find((call) => call.operation === "insert");
    expect(insert?.values).toEqual({
      business_id: own,
      channel: "whatsapp",
      provider: "meta_whatsapp_cloud",
      external_account_id: "123456",
      external_sender_id: "109876543210",
      display_address: "+44 20 0000 0000",
      credential_key: "client_primary",
      enabled: true,
    });
  });

  it("staff cannot mutate WhatsApp connection settings", async () => {
    tenant("staff");
    await expect(saveWhatsAppSettings({}, form())).resolves.toEqual({
      error: "Only a business owner can change WhatsApp settings.",
    });
  });

  it("rejects invalid settings before tenant lookup", async () => {
    const invalid = form();
    invalid.set("external_sender_id", "not-a-phone-id");
    await expect(saveWhatsAppSettings({}, invalid)).resolves.toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

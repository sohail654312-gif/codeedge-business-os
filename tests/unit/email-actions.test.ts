import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveEmailSettings } from "@/modules/email/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const connectionId = "70000000-0000-4000-8000-000000000011";

type Call = {
  table: string;
  operation?: "insert" | "update";
  values?: Record<string, unknown>;
  filters: unknown[][];
};

function tenant(role: "owner" | "staff") {
  const calls: Call[] = [];

  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        call.filters.push(args);
        return chain;
      }),
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
      maybeSingle: vi.fn(async () => {
        if (call.operation === "update") {
          return { data: table === "channel_connections" ? { id: connectionId } : { connection_id: connectionId }, error: null };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => ({
        data: table === "channel_connections" ? { id: connectionId } : { connection_id: connectionId },
        error: null,
      })),
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
        created_at: "2026-09-25T00:00:00Z",
        updated_at: "2026-09-25T00:00:00Z",
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);

  return calls;
}

function form() {
  const value = new FormData();
  value.set("enabled", "on");
  value.set("sender_name", "Codeedge Support");
  value.set("sender_email", "Support@Example.com");
  value.set("reply_to_email", "Replies@Example.com");
  value.set("inbound_email", "Inbox@Example.com");
  value.set("credential_key", "client_primary");
  value.set("business_id", other);
  value.set("provider", "attacker_provider");
  return value;
}

beforeEach(() => vi.clearAllMocks());

describe("Email settings action", () => {
  it("derives tenant, Email channel and Resend provider server-side", async () => {
    const calls = tenant("owner");
    await expect(saveEmailSettings({}, form())).resolves.toHaveProperty("success");

    const connectionInsert = calls.find(
      (call) => call.table === "channel_connections" && call.operation === "insert",
    );
    expect(connectionInsert?.values).toEqual({
      business_id: own,
      channel: "email",
      provider: "resend_email",
      external_account_id: "",
      external_sender_id: "support@example.com",
      display_address: "Codeedge Support",
      credential_key: "client_primary",
      enabled: false,
    });

    const settingsInsert = calls.find(
      (call) => call.table === "email_channel_settings" && call.operation === "insert",
    );
    expect(settingsInsert?.values).toEqual({
      business_id: own,
      connection_id: connectionId,
      sender_name: "Codeedge Support",
      sender_email: "support@example.com",
      reply_to_email: "replies@example.com",
      inbound_email: "inbox@example.com",
    });

    const finalEnable = calls.find(
      (call) => call.table === "channel_connections"
        && call.operation === "update"
        && call.values?.enabled === true,
    );
    expect(finalEnable).toBeTruthy();
  });

  it("staff cannot mutate Email connection settings", async () => {
    tenant("staff");
    await expect(saveEmailSettings({}, form())).resolves.toEqual({
      error: "Only a business owner can change Email settings.",
    });
  });

  it("rejects invalid settings before tenant lookup", async () => {
    const invalid = form();
    invalid.set("inbound_email", "not-an-email");
    await expect(saveEmailSettings({}, invalid)).resolves.toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

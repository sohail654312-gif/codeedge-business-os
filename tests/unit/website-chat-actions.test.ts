import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveWebsiteChatSettings } from "@/modules/website-chat/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";

type Call = {
  operation?: "insert" | "update";
  values?: Record<string, unknown>;
  filters: unknown[][];
};

function form() {
  const data = new FormData();
  data.set("enabled", "on");
  data.set("widget_name", "Business Support");
  data.set("launcher_label", "Chat with us");
  data.set("greeting_text", "We are online");
  data.set("welcome_message", "Welcome");
  data.set("offline_message", "Unavailable");
  data.set("lead_capture_enabled", "on");
  data.set("accent_color", "#23BDF0");
  data.set("business_id", other);
  data.set("public_id", "71000000-0000-4000-8000-000000000099");
  return data;
}

function setup(role: "owner" | "staff", exists = false) {
  const calls: Call[] = [];
  const from = vi.fn(() => {
    const call: Call = { filters: [] };
    calls.push(call);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        call.filters.push(args);
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({
        data: call.operation ? { public_id: "71000000-0000-4000-8000-000000000001" } : exists ? { business_id: own } : null,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: { public_id: "71000000-0000-4000-8000-000000000001" },
        error: null,
      })),
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

beforeEach(() => vi.clearAllMocks());

describe("Website Chat settings action", () => {
  it("derives widget ownership server-side and ignores public/business IDs from the browser", async () => {
    const calls = setup("owner");
    expect(await saveWebsiteChatSettings({}, form())).toHaveProperty("success");

    const insert = calls.find((call) => call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      enabled: true,
      widget_name: "Business Support",
    });
    expect(insert?.values).not.toHaveProperty("public_id");
  });

  it("allows owner update but scopes it to the verified tenant", async () => {
    const calls = setup("owner", true);
    expect(await saveWebsiteChatSettings({}, form())).toHaveProperty("success");

    const update = calls.find((call) => call.operation === "update");
    expect(update?.filters).toEqual([["business_id", own]]);
  });

  it("keeps staff read-only", async () => {
    const calls = setup("staff");
    expect(await saveWebsiteChatSettings({}, form())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("rejects invalid settings before tenant resolution", async () => {
    const data = form();
    data.set("accent_color", "blue");
    expect(await saveWebsiteChatSettings({}, data)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

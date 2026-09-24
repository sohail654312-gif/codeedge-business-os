import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBusinessSettings } from "@/modules/settings/actions";
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
  table: string;
  operation?: "insert" | "update";
  values?: unknown;
  filters: unknown[][];
};

function setup(role: "owner" | "staff" = "owner", existing = false) {
  const calls: Call[] = [];

  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);

    const row = () => {
      if (!call.operation) return existing ? { business_id: own } : null;
      return { business_id: own };
    };

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        call.filters.push(args);
        return chain;
      }),
      insert: vi.fn((values: unknown) => {
        call.operation = "insert";
        call.values = values;
        return chain;
      }),
      update: vi.fn((values: unknown) => {
        call.operation = "update";
        call.values = values;
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
      single: vi.fn(async () => ({ data: row(), error: null })),
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

function settingsForm() {
  const form = new FormData();
  form.set("locale", "en-GB");
  form.set("lead_notification_email", "leads@example.test");
  form.set("notify_new_leads", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Business Settings server action", () => {
  it("creates settings with server-derived business ownership", async () => {
    const calls = setup("owner", false);
    const form = settingsForm();
    form.set("business_id", other);

    expect(await saveBusinessSettings({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "business_settings" && call.operation === "insert");
    expect(insert?.values).toEqual({
      business_id: own,
      locale: "en-GB",
      lead_notification_email: "leads@example.test",
      notify_new_leads: true,
    });
  });

  it("updates only the authenticated workspace settings row", async () => {
    const calls = setup("owner", true);

    expect(await saveBusinessSettings({}, settingsForm())).toHaveProperty("success");

    const update = calls.find((call) => call.table === "business_settings" && call.operation === "update");
    expect(update?.values).toEqual({
      locale: "en-GB",
      lead_notification_email: "leads@example.test",
      notify_new_leads: true,
    });
    expect(update?.filters).toEqual([["business_id", own]]);
  });

  it("staff cannot change Business Settings", async () => {
    const calls = setup("staff", true);

    expect(await saveBusinessSettings({}, settingsForm())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("rejects invalid settings before resolving a tenant", async () => {
    const form = settingsForm();
    form.set("locale", "not a locale");

    expect(await saveBusinessSettings({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });

  it("allows a blank lead notification email", async () => {
    const calls = setup("owner", false);
    const form = settingsForm();
    form.set("lead_notification_email", "");
    form.delete("notify_new_leads");

    expect(await saveBusinessSettings({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      lead_notification_email: "",
      notify_new_leads: false,
    });
  });
});

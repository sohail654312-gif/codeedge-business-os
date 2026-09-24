import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createServiceArea,
  deleteServiceArea,
  saveOpeningHours,
  updateServiceArea,
} from "@/modules/service-coverage/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const areaId = "50000000-0000-4000-8000-000000000001";

type Call = {
  table: string;
  operation?: "insert" | "update" | "delete";
  values?: unknown;
  filters: unknown[][];
};

function setup(role: "owner" | "staff" = "owner", existingHours = false) {
  const calls: Call[] = [];

  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);

    const row = () => {
      if (table === "opening_hours" && !call.operation) {
        return existingHours ? { weekday: 1 } : null;
      }
      if (call.operation) {
        return table === "opening_hours" ? { weekday: 1 } : { id: areaId };
      }
      return null;
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
      delete: vi.fn(() => {
        call.operation = "delete";
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

function areaForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    service_area_id: areaId,
    name: "Westminster",
    postcode: "sw1a1aa",
    notes: "Central London",
    display_order: "2",
  })) form.set(key, value);
  form.set("active", "on");
  return form;
}

function hoursForm(closed = false) {
  const form = new FormData();
  form.set("weekday", "1");
  if (closed) form.set("is_closed", "on");
  form.set("opens_at", "09:00");
  form.set("closes_at", "17:00");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Service Coverage server actions", () => {
  it("derives Service Area ownership from the authenticated workspace", async () => {
    const calls = setup();
    const form = areaForm();
    form.delete("service_area_id");
    form.set("business_id", other);

    expect(await createServiceArea({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "service_areas" && call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      name: "Westminster",
      postcode: "SW1A 1AA",
      display_order: 2,
    });
  });

  it("scopes Service Area updates by verified tenant and area id", async () => {
    const calls = setup();

    expect(await updateServiceArea({}, areaForm())).toHaveProperty("success");

    const update = calls.find((call) => call.table === "service_areas" && call.operation === "update");
    expect(update?.filters).toEqual([
      ["business_id", own],
      ["id", areaId],
    ]);
  });

  it("scopes Service Area deletes by verified tenant and area id", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("service_area_id", areaId);

    expect(await deleteServiceArea({}, form)).toHaveProperty("success");

    const deletion = calls.find((call) => call.table === "service_areas" && call.operation === "delete");
    expect(deletion?.filters).toEqual([
      ["business_id", own],
      ["id", areaId],
    ]);
  });

  it("creates Opening Hours with server-derived business ownership", async () => {
    const calls = setup("owner", false);
    const form = hoursForm();
    form.set("business_id", other);

    expect(await saveOpeningHours({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "opening_hours" && call.operation === "insert");
    expect(insert?.values).toEqual({
      business_id: own,
      weekday: 1,
      is_closed: false,
      opens_at: "09:00",
      closes_at: "17:00",
    });
  });

  it("updates an existing weekday without rewriting tenant or weekday identity", async () => {
    const calls = setup("owner", true);

    expect(await saveOpeningHours({}, hoursForm(true))).toHaveProperty("success");

    const update = calls.find((call) => call.table === "opening_hours" && call.operation === "update");
    expect(update?.values).toEqual({
      is_closed: true,
      opens_at: null,
      closes_at: null,
    });
    expect(update?.filters).toEqual([
      ["business_id", own],
      ["weekday", 1],
    ]);
  });

  it.each([
    ["create area", createServiceArea, () => {
      const form = areaForm();
      form.delete("service_area_id");
      return form;
    }],
    ["update area", updateServiceArea, areaForm],
    ["delete area", deleteServiceArea, () => {
      const form = new FormData();
      form.set("service_area_id", areaId);
      return form;
    }],
    ["opening hours", saveOpeningHours, hoursForm],
  ] as const)("staff cannot mutate %s", async (_name, action, makeForm) => {
    const calls = setup("staff");

    expect(await action({}, makeForm())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("rejects invalid postcode before resolving a tenant", async () => {
    const form = areaForm();
    form.set("postcode", "INVALID");

    expect(await updateServiceArea({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });

  it.each([
    ["partial opening time", { opens_at: "", closes_at: "17:00" }],
    ["reverse interval", { opens_at: "17:00", closes_at: "09:00" }],
    ["invalid weekday", { weekday: "8" }],
  ])("rejects invalid Opening Hours before resolving a tenant: %s", async (_name, values) => {
    const form = hoursForm();
    for (const [key, value] of Object.entries(values)) form.set(key, value);

    expect(await saveOpeningHours({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

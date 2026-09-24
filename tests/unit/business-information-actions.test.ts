import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createService,
  deleteService,
  saveBusinessProfile,
  updateService,
} from "@/modules/business-information/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const serviceId = "30000000-0000-4000-8000-000000000001";

type Call = {
  table: string;
  operation?: "insert" | "update" | "delete";
  values?: unknown;
  filters: unknown[][];
};

function setup(role: "owner" | "staff" = "owner", profileExists = false) {
  const calls: Call[] = [];

  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);

    const row = () => {
      if (table === "business_profiles" && !call.operation) {
        return profileExists ? { business_id: own } : null;
      }
      if (call.operation) {
        return table === "services"
          ? { id: serviceId }
          : { business_id: own };
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

function profileForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    trading_name: "Business A Trading",
    phone: "+44 20 7946 0000",
    email: "owner@example.test",
    website: "https://example.test",
    address: "1 High Street",
    description: "Business description",
    category: "Plumbing",
    logo_alt: "Business logo",
  })) form.set(key, value);
  return form;
}

function serviceForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    service_id: serviceId,
    name: "Boiler repair",
    description: "Boiler repair service",
    starting_price_gbp: "50.25",
    display_order: "2",
  })) form.set(key, value);
  form.set("active", "on");
  form.set("quote_required", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Business Information server actions", () => {
  it("derives Business Profile ownership from the authenticated tenant, not form data", async () => {
    const calls = setup();
    const form = profileForm();
    form.set("business_id", other);

    expect(await saveBusinessProfile({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "business_profiles" && call.operation === "insert");
    expect(insert?.values).toMatchObject({ business_id: own });
  });

  it("derives new Service ownership from the authenticated tenant", async () => {
    const calls = setup();
    const form = serviceForm();
    form.delete("service_id");
    form.set("business_id", other);

    expect(await createService({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "services" && call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      name: "Boiler repair",
      starting_price_pence: 5025,
    });
  });

  it("scopes Service updates by both verified tenant and Service id", async () => {
    const calls = setup();

    expect(await updateService({}, serviceForm())).toHaveProperty("success");

    const update = calls.find((call) => call.table === "services" && call.operation === "update");
    expect(update?.filters).toEqual([
      ["business_id", own],
      ["id", serviceId],
    ]);
  });

  it("scopes Service deletes by both verified tenant and Service id", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("service_id", serviceId);

    expect(await deleteService({}, form)).toHaveProperty("success");

    const deletion = calls.find((call) => call.table === "services" && call.operation === "delete");
    expect(deletion?.filters).toEqual([
      ["business_id", own],
      ["id", serviceId],
    ]);
  });

  it.each([
    ["profile", saveBusinessProfile, profileForm],
    ["create service", createService, () => {
      const form = serviceForm();
      form.delete("service_id");
      return form;
    }],
    ["update service", updateService, serviceForm],
    ["delete service", deleteService, () => {
      const form = new FormData();
      form.set("service_id", serviceId);
      return form;
    }],
  ] as const)("staff cannot mutate %s", async (_name, action, makeForm) => {
    const calls = setup("staff");

    expect(await action({}, makeForm())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("rejects invalid Profile input before resolving a tenant", async () => {
    const form = profileForm();
    form.set("website", "http://insecure.example.test");

    expect(await saveBusinessProfile({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

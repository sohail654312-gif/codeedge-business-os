import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFaq,
  deleteFaq,
  updateFaq,
} from "@/modules/faqs/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const faqId = "60000000-0000-4000-8000-000000000001";

type Call = {
  table: string;
  operation?: "insert" | "update" | "delete";
  values?: unknown;
  filters: unknown[][];
};

function setup(role: "owner" | "staff" = "owner") {
  const calls: Call[] = [];

  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);

    const row = () => {
      if (call.operation) return { id: faqId };
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

function faqForm() {
  const form = new FormData();
  form.set("faq_id", faqId);
  form.set("question", "Do you offer emergency callouts?");
  form.set("answer", "Yes, subject to availability.");
  form.set("display_order", "2");
  form.set("is_active", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FAQ server actions", () => {
  it("derives FAQ ownership from the authenticated workspace", async () => {
    const calls = setup();
    const form = faqForm();
    form.delete("faq_id");
    form.set("business_id", other);

    expect(await createFaq({}, form)).toHaveProperty("success");

    const insert = calls.find((call) => call.table === "business_faqs" && call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      question: "Do you offer emergency callouts?",
      answer: "Yes, subject to availability.",
      is_active: true,
      display_order: 2,
    });
  });

  it("scopes FAQ updates by verified tenant and FAQ id", async () => {
    const calls = setup();

    expect(await updateFaq({}, faqForm())).toHaveProperty("success");

    const update = calls.find((call) => call.table === "business_faqs" && call.operation === "update");
    expect(update?.filters).toEqual([
      ["business_id", own],
      ["id", faqId],
    ]);
  });

  it("scopes FAQ deletes by verified tenant and FAQ id", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("faq_id", faqId);

    expect(await deleteFaq({}, form)).toHaveProperty("success");

    const deletion = calls.find((call) => call.table === "business_faqs" && call.operation === "delete");
    expect(deletion?.filters).toEqual([
      ["business_id", own],
      ["id", faqId],
    ]);
  });

  it.each([
    ["create", createFaq, () => {
      const form = faqForm();
      form.delete("faq_id");
      return form;
    }],
    ["update", updateFaq, faqForm],
    ["delete", deleteFaq, () => {
      const form = new FormData();
      form.set("faq_id", faqId);
      return form;
    }],
  ] as const)("staff cannot %s FAQs", async (_label, action, makeForm) => {
    const calls = setup("staff");

    expect(await action({}, makeForm())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("rejects invalid FAQ input before resolving a tenant", async () => {
    const form = faqForm();
    form.set("question", " ");

    expect(await updateFaq({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

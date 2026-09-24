import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addConversationMessage,
  startLeadConversation,
  updateConversationStatus,
} from "@/modules/contact-me/conversations/actions";
import { requireDashboardTenant } from "@/server/auth/session";
import { redirect } from "next/navigation";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const leadId = "40000000-0000-4000-8000-000000000001";
const customerId = "50000000-0000-4000-8000-000000000011";
const conversationId = "60000000-0000-4000-8000-000000000001";

type Recorded = {
  table: string;
  operation?: "insert" | "update";
  values?: Record<string, unknown>;
  filters: unknown[][];
};

function setup() {
  const calls: Recorded[] = [];

  const from = vi.fn((table: string) => {
    const call: Recorded = { table, filters: [] };
    calls.push(call);

    if (table === "messages") {
      return {
        insert: vi.fn(async (values: Record<string, unknown>) => {
          call.operation = "insert";
          call.values = values;
          return { error: null };
        }),
      };
    }

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
        if (table === "leads") return { data: { id: leadId, contact_name: "Lead A" }, error: null };
        if (table === "customers") return { data: { id: customerId }, error: null };
        if (table === "conversations") return { data: { id: conversationId, lead_id: leadId }, error: null };
        return { data: null, error: null };
      }),
      single: vi.fn(async () => ({ data: { id: conversationId }, error: null })),
    };

    return chain;
  });

  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: { from },
    context: {
      userId,
      role: "staff",
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Conversation server actions", () => {
  it("derives conversation business and CRM Customer server-side", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("lead_id", leadId);
    form.set("subject", "Lead conversation");
    form.set("business_id", other);
    form.set("customer_id", "50000000-0000-4000-8000-000000000099");

    await startLeadConversation({}, form);

    const insert = calls.find((call) => call.table === "conversations" && call.operation === "insert");
    expect(insert?.values).toMatchObject({
      business_id: own,
      lead_id: leadId,
      customer_id: customerId,
      channel: "internal",
      status: "open",
      created_by: userId,
    });
    expect(redirect).toHaveBeenCalledWith(`/dashboard/contact-me/${conversationId}`);
  });

  it("ignores forged business and sender identity when storing a message", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "reply");
    form.set("body", "Hello");
    form.set("business_id", other);
    form.set("sender_user_id", "10000000-0000-4000-8000-000000000002");
    form.set("sender_type", "customer");

    await addConversationMessage({}, form);

    const insert = calls.find((call) => call.table === "messages" && call.operation === "insert");
    expect(insert?.values).toEqual({
      business_id: own,
      conversation_id: conversationId,
      sender_type: "staff",
      sender_user_id: userId,
      direction: "outbound",
      body: "Hello",
    });
  });

  it("stores internal-note intent as an internal direction", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "internal");
    form.set("body", "Private context");

    await addConversationMessage({}, form);

    const insert = calls.find((call) => call.table === "messages" && call.operation === "insert");
    expect(insert?.values).toMatchObject({
      sender_type: "staff",
      sender_user_id: userId,
      direction: "internal",
      body: "Private context",
    });
  });

  it("scopes status changes by verified tenant and conversation id", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("status", "resolved");
    form.set("business_id", other);

    expect(await updateConversationStatus({}, form)).toHaveProperty("success");

    const update = calls.find((call) => call.table === "conversations" && call.operation === "update");
    expect(update?.values).toEqual({ status: "resolved" });
    expect(update?.filters).toEqual([
      ["business_id", own],
      ["id", conversationId],
    ]);
  });

  it("rejects invalid message input before resolving a tenant", async () => {
    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "reply");
    form.set("body", "   ");

    expect(await addConversationMessage({}, form)).toHaveProperty("error");
    expect(requireDashboardTenant).not.toHaveBeenCalled();
  });
});

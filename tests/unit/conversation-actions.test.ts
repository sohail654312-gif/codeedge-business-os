import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addConversationMessage,
  startLeadConversation,
  updateConversationStatus,
} from "@/modules/contact-me/conversations/actions";
import { requireDashboardTenant } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { sendEmailReply } from "@/server/channels/email";
import { sendSmsReply } from "@/server/channels/sms";
import { sendWhatsAppReply } from "@/server/channels/whatsapp";

vi.mock("@/server/auth/session", () => ({
  requireDashboardTenant: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/channels/whatsapp", () => ({
  sendWhatsAppReply: vi.fn(),
}));

vi.mock("@/server/channels/email", () => ({
  sendEmailReply: vi.fn(),
}));

vi.mock("@/server/channels/sms", () => ({
  sendSmsReply: vi.fn(),
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

function setup(channel: "internal" | "whatsapp" | "email" | "sms" = "internal") {
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
        if (table === "conversations") return { data: { id: conversationId, lead_id: leadId, channel }, error: null };
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

  it("routes WhatsApp replies through the provider boundary without a local-only insert", async () => {
    const calls = setup("whatsapp");
    vi.mocked(sendWhatsAppReply).mockResolvedValue({
      messageId: "90000000-0000-4000-8000-000000000001",
      status: "sent",
    });

    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "reply");
    form.set("body", "WhatsApp reply");
    form.set("request_id", "80000000-0000-4000-8000-000000000001");

    await addConversationMessage({}, form);

    expect(sendWhatsAppReply).toHaveBeenCalledWith({
      businessId: own,
      conversationId,
      userId,
      requestId: "80000000-0000-4000-8000-000000000001",
      body: "WhatsApp reply",
    });
    expect(calls.some((call) => call.table === "messages" && call.operation === "insert")).toBe(false);
    expect(redirect).toHaveBeenCalledWith(`/dashboard/contact-me/${conversationId}`);
  });

  it("routes Email replies through the provider boundary without a local-only insert", async () => {
    const calls = setup("email");
    vi.mocked(sendEmailReply).mockResolvedValue({
      messageId: "90000000-0000-4000-8000-000000000011",
      status: "queued",
    });

    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "reply");
    form.set("body", "Email reply");
    form.set("request_id", "80000000-0000-4000-8000-000000000011");

    await addConversationMessage({}, form);

    expect(sendEmailReply).toHaveBeenCalledWith({
      businessId: own,
      conversationId,
      userId,
      requestId: "80000000-0000-4000-8000-000000000011",
      body: "Email reply",
    });
    expect(calls.some((call) => call.table === "messages" && call.operation === "insert")).toBe(false);
    expect(redirect).toHaveBeenCalledWith(`/dashboard/contact-me/${conversationId}`);
  });

  it("routes SMS replies through the provider boundary without a local-only insert", async () => {
    const calls = setup("sms");
    vi.mocked(sendSmsReply).mockResolvedValue({
      messageId: "90000000-0000-4000-8000-000000000021",
      status: "queued",
    });

    const form = new FormData();
    form.set("conversation_id", conversationId);
    form.set("message_kind", "reply");
    form.set("body", "SMS reply");
    form.set("request_id", "80000000-0000-4000-8000-000000000021");

    await addConversationMessage({}, form);

    expect(sendSmsReply).toHaveBeenCalledWith({
      businessId: own,
      conversationId,
      userId,
      requestId: "80000000-0000-4000-8000-000000000021",
      body: "SMS reply",
    });
    expect(calls.some((call) => call.table === "messages" && call.operation === "insert")).toBe(false);
    expect(redirect).toHaveBeenCalledWith(`/dashboard/contact-me/${conversationId}`);
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

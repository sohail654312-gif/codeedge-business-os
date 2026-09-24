import { describe, expect, it } from "vitest";
import {
  conversationChannelSchema,
  conversationIdSchema,
  conversationStatusSchema,
  inboxFilterSchema,
  localMessageFormSchema,
  messageBodySchema,
  messageDirectionSchema,
  messageSenderTypeSchema,
  startLeadConversationSchema,
} from "@/modules/contact-me/conversations/validation";

describe("Conversation domain validation", () => {
  it.each(["website_chat", "whatsapp", "email", "sms", "voice", "internal"])(
    "accepts channel %s",
    (channel) => expect(conversationChannelSchema.safeParse(channel).success).toBe(true),
  );

  it.each(["open", "pending", "resolved", "closed"])(
    "accepts status %s",
    (status) => expect(conversationStatusSchema.safeParse(status).success).toBe(true),
  );

  it.each(["customer", "staff", "ai", "system"])(
    "accepts sender type %s",
    (sender) => expect(messageSenderTypeSchema.safeParse(sender).success).toBe(true),
  );

  it.each(["inbound", "outbound", "internal"])(
    "accepts direction %s",
    (direction) => expect(messageDirectionSchema.safeParse(direction).success).toBe(true),
  );

  it.each(["fax", "telegram", "web_chat", ""])("rejects unsupported channel %s", (value) => {
    expect(conversationChannelSchema.safeParse(value).success).toBe(false);
  });

  it.each(["new", "archived", ""])("rejects unsupported status %s", (value) => {
    expect(conversationStatusSchema.safeParse(value).success).toBe(false);
  });

  it("trims and validates plain-text message bodies", () => {
    expect(messageBodySchema.parse("  Hello team  ")).toBe("Hello team");
    expect(messageBodySchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(4001)).success).toBe(false);
  });

  it("allows only local reply or internal note form intents", () => {
    expect(localMessageFormSchema.safeParse({
      conversation_id: "60000000-0000-4000-8000-000000000001",
      message_kind: "reply",
      body: "Local reply",
    }).success).toBe(true);

    expect(localMessageFormSchema.safeParse({
      conversation_id: "60000000-0000-4000-8000-000000000001",
      message_kind: "inbound",
      body: "Forged customer message",
    }).success).toBe(false);
  });

  it("validates Lead-linked internal conversation creation", () => {
    const result = startLeadConversationSchema.parse({
      lead_id: "40000000-0000-4000-8000-000000000001",
      subject: "  Heating enquiry  ",
    });

    expect(result.subject).toBe("Heating enquiry");
    expect(startLeadConversationSchema.safeParse({
      lead_id: "not-a-lead",
      subject: "",
    }).success).toBe(false);
  });

  it("accepts only UUID conversation selectors", () => {
    expect(conversationIdSchema.safeParse("60000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(conversationIdSchema.safeParse("../../other-tenant").success).toBe(false);
  });

  it("normalizes invalid inbox filters back to unfiltered values", () => {
    expect(inboxFilterSchema.parse({ status: "bad", channel: "bad" })).toEqual({
      status: null,
      channel: null,
    });
  });
});

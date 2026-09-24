import { describe, expect, it } from "vitest";
import {
  publicWidgetIdSchema,
  validateWebsiteChatContact,
  visitorSessionTokenSchema,
  websiteChatRequestSchema,
  websiteChatSettingsSchema,
} from "@/modules/website-chat/validation";

const widgetId = "71000000-0000-4000-8000-000000000001";
const requestId = "72000000-0000-4000-8000-000000000001";

describe("Website Chat validation", () => {
  it("accepts production widget settings", () => {
    expect(websiteChatSettingsSchema.parse({
      enabled: true,
      widget_name: "Northfield Support",
      launcher_label: "Chat with us",
      greeting_text: "We are online",
      welcome_message: "Welcome. How can we help?",
      offline_message: "We are unavailable right now.",
      lead_capture_enabled: true,
      accent_color: "#23BDF0",
    })).toMatchObject({ enabled: true, accent_color: "#23BDF0" });
  });

  it.each(["#fff", "blue", "#GG0000", "23BDF0"])("rejects invalid accent colour %s", (value) => {
    expect(websiteChatSettingsSchema.safeParse({
      enabled: true,
      widget_name: "Support",
      launcher_label: "Chat",
      greeting_text: "Hello",
      welcome_message: "Welcome",
      offline_message: "Offline",
      lead_capture_enabled: true,
      accent_color: value,
    }).success).toBe(false);
  });

  it.each([
    { action: "start", business_id: widgetId },
    { action: "history", conversation_id: widgetId },
    { action: "send", requestId, body: "", sender: "staff" },
    { action: "send", requestId: "bad", body: "Hello" },
    { action: "send", requestId, body: "x".repeat(2001) },
  ])("rejects forged or invalid public request %j", (value) => {
    expect(websiteChatRequestSchema.safeParse(value).success).toBe(false);
  });

  it("accepts the supported public operations only", () => {
    expect(websiteChatRequestSchema.safeParse({ action: "start" }).success).toBe(true);
    expect(websiteChatRequestSchema.safeParse({ action: "history" }).success).toBe(true);
    expect(websiteChatRequestSchema.safeParse({ action: "status" }).success).toBe(true);
    expect(websiteChatRequestSchema.safeParse({
      action: "send",
      requestId,
      body: "  Hello  ",
    }).success).toBe(true);
    expect(websiteChatRequestSchema.safeParse({
      action: "contact",
      contact_name: "Visitor",
      phone: "+44 20 0000 0000",
      email: "",
    }).success).toBe(true);
  });

  it("reuses CRM validation for contact capture", () => {
    expect(validateWebsiteChatContact({
      contact_name: " Visitor ",
      phone: "",
      email: "visitor@example.test",
    })).toEqual({
      contact_name: "Visitor",
      phone: "",
      email: "visitor@example.test",
    });

    expect(() => validateWebsiteChatContact({
      contact_name: "Visitor",
      phone: "",
      email: "",
    })).toThrow();
  });

  it("validates public widget IDs and visitor session tokens", () => {
    expect(publicWidgetIdSchema.safeParse(widgetId).success).toBe(true);
    expect(publicWidgetIdSchema.safeParse("../../tenant").success).toBe(false);
    expect(visitorSessionTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(visitorSessionTokenSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(visitorSessionTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
  });
});

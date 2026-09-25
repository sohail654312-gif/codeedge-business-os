import { describe, expect, it } from "vitest";
import { emailConnectionSettingsSchema } from "@/modules/email/validation";

describe("Email settings validation", () => {
  it("normalizes production-safe Email settings", () => {
    expect(emailConnectionSettingsSchema.parse({
      enabled: true,
      sender_name: "Codeedge Support",
      sender_email: "Support@Example.com",
      reply_to_email: "Replies@Example.com",
      inbound_email: "Inbox@Example.com",
      credential_key: "client_primary",
    })).toEqual({
      enabled: true,
      sender_name: "Codeedge Support",
      sender_email: "support@example.com",
      reply_to_email: "replies@example.com",
      inbound_email: "inbox@example.com",
      credential_key: "client_primary",
    });
  });

  it.each([
    ["sender_email", "not-an-email"],
    ["inbound_email", "bad @example.com"],
    ["credential_key", "../secret"],
    ["credential_key", "key with spaces"],
  ])("rejects unsafe %s", (field, value) => {
    const input = {
      enabled: true,
      sender_name: "Codeedge",
      sender_email: "support@example.com",
      reply_to_email: "",
      inbound_email: "inbox@example.com",
      credential_key: "client_primary",
      [field]: value,
    };

    expect(emailConnectionSettingsSchema.safeParse(input).success).toBe(false);
  });
});

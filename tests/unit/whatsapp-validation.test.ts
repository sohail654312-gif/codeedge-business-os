import { describe, expect, it } from "vitest";
import { whatsappConnectionSettingsSchema } from "@/modules/whatsapp/validation";

describe("WhatsApp settings validation", () => {
  it("accepts a provider-safe connection description", () => {
    expect(whatsappConnectionSettingsSchema.parse({
      enabled: true,
      external_account_id: "123456789",
      external_sender_id: "109876543210",
      display_address: "+44 20 0000 0000",
      credential_key: "client_primary",
    })).toEqual({
      enabled: true,
      external_account_id: "123456789",
      external_sender_id: "109876543210",
      display_address: "+44 20 0000 0000",
      credential_key: "client_primary",
    });
  });

  it.each([
    ["external_sender_id", "abc"],
    ["credential_key", "../secret"],
    ["credential_key", "a b"],
  ])("rejects unsafe %s", (field, value) => {
    const input = {
      enabled: true,
      external_account_id: "",
      external_sender_id: "109876543210",
      display_address: "",
      credential_key: "client_primary",
      [field]: value,
    };

    expect(whatsappConnectionSettingsSchema.safeParse(input).success).toBe(false);
  });
});

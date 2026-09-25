import { describe, expect, it } from "vitest";
import {
  e164PhoneSchema,
  smsConnectionSettingsSchema,
  twilioAccountSidSchema,
} from "@/modules/sms/validation";

describe("SMS validation", () => {
  it("accepts normalized E.164 numbers and Twilio Account SIDs", () => {
    expect(e164PhoneSchema.parse("+447700900123")).toBe("+447700900123");
    expect(twilioAccountSidSchema.parse("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .toBe("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("rejects local-format or malformed phone numbers", () => {
    expect(e164PhoneSchema.safeParse("07700900123").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+0123456789").success).toBe(false);
  });

  it("normalizes settings while keeping tenant/provider identity out of input", () => {
    expect(smsConnectionSettingsSchema.parse({
      enabled: true,
      external_account_id: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      external_sender_id: " +447700900123 ",
      display_address: " Primary SMS ",
      credential_key: "client_primary",
    })).toEqual({
      enabled: true,
      external_account_id: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      external_sender_id: "+447700900123",
      display_address: "Primary SMS",
      credential_key: "client_primary",
    });
  });
});

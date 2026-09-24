import { describe, expect, it } from "vitest";
import {
  defaultBusinessSettings,
  settingsSchema,
} from "@/modules/settings/validation";

describe("Business Settings validation", () => {
  it("accepts supported locale and optional email preferences", () => {
    expect(settingsSchema.parse({
      locale: "en-GB",
      lead_notification_email: "leads@example.test",
      notify_new_leads: true,
    })).toEqual({
      locale: "en-GB",
      lead_notification_email: "leads@example.test",
      notify_new_leads: true,
    });
  });

  it.each(["en", "en-GB", "ur-PK", "zh-Hans-CN"])("accepts locale %s", (locale) => {
    expect(settingsSchema.safeParse({
      locale,
      lead_notification_email: "",
      notify_new_leads: false,
    }).success).toBe(true);
  });

  it.each(["e", "en GB", "english-GB", "en_ GB", "en-"])("rejects invalid locale %s", (locale) => {
    expect(settingsSchema.safeParse({
      locale,
      lead_notification_email: "",
      notify_new_leads: true,
    }).success).toBe(false);
  });

  it("accepts a blank notification email and rejects malformed email", () => {
    expect(settingsSchema.safeParse({
      locale: "en-GB",
      lead_notification_email: "",
      notify_new_leads: true,
    }).success).toBe(true);

    expect(settingsSchema.safeParse({
      locale: "en-GB",
      lead_notification_email: "not-an-email",
      notify_new_leads: true,
    }).success).toBe(false);
  });

  it("defines safe UI defaults without implying delivery is active", () => {
    expect(defaultBusinessSettings).toEqual({
      locale: "en-GB",
      lead_notification_email: "",
      notify_new_leads: true,
    });
  });
});

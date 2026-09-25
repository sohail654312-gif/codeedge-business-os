import { z } from "zod";

export const e164PhoneSchema = z.string().trim().regex(
  /^\+[1-9][0-9]{7,14}$/,
  "Enter an E.164 phone number such as +447700900123.",
);

export const twilioAccountSidSchema = z.string().trim().regex(
  /^AC[0-9A-Fa-f]{32}$/,
  "Enter a valid Twilio Account SID.",
);

export const smsConnectionSettingsSchema = z.object({
  enabled: z.boolean(),
  external_account_id: twilioAccountSidSchema,
  external_sender_id: e164PhoneSchema,
  display_address: z.string().trim().max(120),
  credential_key: z.string().trim().regex(
    /^[A-Za-z0-9._-]{2,80}$/,
    "Credential key may use letters, numbers, dots, underscores and hyphens.",
  ),
});

export type SmsConnectionSettings = z.infer<typeof smsConnectionSettingsSchema>;

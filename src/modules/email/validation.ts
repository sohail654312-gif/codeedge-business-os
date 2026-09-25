import { z } from "zod";

const email = z.string().trim().max(254).regex(
  /^[^\s@<>]+@[^\s@<>]+$/,
  "Enter a valid email address.",
).transform((value) => value.toLowerCase());

const optionalEmail = z.union([
  z.literal(""),
  email,
]);

export const emailConnectionSettingsSchema = z.object({
  enabled: z.boolean(),
  sender_name: z.string().trim().max(120),
  sender_email: email,
  reply_to_email: optionalEmail,
  inbound_email: email,
  credential_key: z.string().trim().regex(
    /^[A-Za-z0-9._-]{2,80}$/,
    "Credential key may use letters, numbers, dots, underscores and hyphens.",
  ),
});

export type EmailConnectionSettings = z.infer<typeof emailConnectionSettingsSchema>;

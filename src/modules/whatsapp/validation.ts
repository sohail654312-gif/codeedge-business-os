import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);

export const whatsappConnectionSettingsSchema = z.object({
  enabled: z.boolean(),
  external_account_id: trimmed(255),
  external_sender_id: z.string().trim().regex(
    /^[0-9]{5,32}$/,
    "Enter the Meta WhatsApp phone number ID.",
  ),
  display_address: trimmed(120),
  credential_key: z.string().trim().regex(
    /^[A-Za-z0-9._-]{2,80}$/,
    "Credential key may use letters, numbers, dots, underscores and hyphens.",
  ),
});

export type WhatsAppConnectionSettings = z.infer<typeof whatsappConnectionSettingsSchema>;

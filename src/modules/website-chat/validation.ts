import { z } from "zod";
import { leadCreateFormSchema } from "@/modules/buy-from-me/leads/validation";

const widgetText = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max);

export const publicWidgetIdSchema = z.uuid();

export const websiteChatSettingsSchema = z.object({
  enabled: z.boolean(),
  widget_name: widgetText(2, 80, "Widget name is required."),
  launcher_label: widgetText(2, 40, "Launcher label is required."),
  greeting_text: widgetText(1, 200, "Greeting text is required."),
  welcome_message: widgetText(1, 500, "Welcome message is required."),
  offline_message: widgetText(1, 500, "Offline message is required."),
  lead_capture_enabled: z.boolean(),
  accent_color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex colour such as #23BDF0."),
});

export const websiteChatRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("history") }).strict(),
  z.object({ action: z.literal("status") }).strict(),
  z.object({
    action: z.literal("send"),
    requestId: z.uuid(),
    body: z.string().trim().min(1, "Message is required.").max(2000),
  }).strict(),
  z.object({
    action: z.literal("contact"),
    contact_name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).regex(/^[+0-9().\s-]*$/, "Use a valid phone number."),
    email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  }).strict(),
]);

export const visitorSessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function validateWebsiteChatContact(input: {
  contact_name: string;
  phone: string;
  email: string;
}) {
  const parsed = leadCreateFormSchema.safeParse({
    contact_name: input.contact_name,
    phone: input.phone,
    email: input.email,
    source: "website",
    service_id: "",
    enquiry_summary: "Website Chat enquiry",
    estimated_value_gbp: "",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check your contact details.");
  }

  return {
    contact_name: parsed.data.contact_name,
    phone: parsed.data.phone,
    email: parsed.data.email,
  };
}

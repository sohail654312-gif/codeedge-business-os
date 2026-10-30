"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { whatsappConnectionSettingsSchema } from "./validation";
import { z } from "zod";
import { recordWhatsAppConsent, refreshWhatsAppTemplates, setWhatsAppControl, sendWhatsAppTemplate } from "@/server/channels/whatsapp";
import { randomUUID } from "node:crypto";

export type WhatsAppSettingsState = {
  error?: string;
  success?: string;
};

export async function saveWhatsAppSettings(
  _state: WhatsAppSettingsState,
  formData: FormData,
): Promise<WhatsAppSettingsState> {
  const parsed = whatsappConnectionSettingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    external_account_id: formData.get("external_account_id"),
    external_sender_id: formData.get("external_sender_id"),
    display_address: formData.get("display_address"),
    credential_key: formData.get("credential_key"),
    ...(formData.has("whatsapp_assistant_settings") ? {
      whatsapp_ai_enabled: formData.get("whatsapp_ai_enabled") === "on",
      whatsapp_clinic_mode: formData.get("whatsapp_clinic_mode") === "on",
      whatsapp_escalation_keywords: String(formData.get("whatsapp_escalation_keywords") ?? "").split(",").map(s => s.trim()).filter(Boolean),
    } : {}),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the WhatsApp settings." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only a business owner can change WhatsApp settings." };
  }

  const existing = await client
    .from("channel_connections")
    .select("id")
    .eq("business_id", context.business.id)
    .eq("channel", "whatsapp")
    .eq("provider", "meta_whatsapp_cloud")
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load WhatsApp settings." };
  }

  const values = {
    external_account_id: parsed.data.external_account_id,
    external_sender_id: parsed.data.external_sender_id,
    display_address: parsed.data.display_address,
    credential_key: parsed.data.credential_key,
    enabled: parsed.data.enabled,
    ...(parsed.data.whatsapp_ai_enabled === undefined ? {} : {
      whatsapp_ai_enabled: parsed.data.whatsapp_ai_enabled,
      whatsapp_clinic_mode: parsed.data.whatsapp_clinic_mode,
      whatsapp_escalation_keywords: parsed.data.whatsapp_escalation_keywords,
    }),
  };

  const result = existing.data
    ? await client
      .from("channel_connections")
      .update(values)
      .eq("business_id", context.business.id)
      .eq("id", existing.data.id)
      .select("id")
      .maybeSingle()
    : await client
      .from("channel_connections")
      .insert({
        business_id: context.business.id,
        channel: "whatsapp",
        provider: "meta_whatsapp_cloud",
        ...values,
      })
      .select("id")
      .single();

  if (result.error || !result.data) {
    return { error: "Unable to save WhatsApp settings." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/contact-me");
  return { success: "WhatsApp settings saved." };
}

export async function changeWhatsAppControl(_state: WhatsAppSettingsState, form: FormData): Promise<WhatsAppSettingsState> {
  const parsed = z.object({ conversationId: z.string().uuid(), state: z.enum(["human","automatic"]) }).safeParse({ conversationId: form.get("conversation_id"),state: form.get("state") });
  if (!parsed.success) return { error: "Choose a valid conversation control." };
  const { context } = await requireDashboardTenant();
  try { await setWhatsAppControl({ ...parsed.data,businessId: context.business.id,userId: context.userId }); }
  catch { return { error: "Unable to change control. Opted-out conversations require new consent before resuming." }; }
  revalidatePath(`/dashboard/contact-me/${parsed.data.conversationId}`);
  return { success: parsed.data.state === "human" ? "Human control enabled. AI replies are paused." : "Automation resumed for future messages." };
}

export async function saveWhatsAppConsent(_state: WhatsAppSettingsState, form: FormData): Promise<WhatsAppSettingsState> {
  const parsed = z.object({ conversationId: z.string().uuid(),source: z.string().trim().min(1).max(240),consent: z.boolean() }).safeParse({ conversationId: form.get("conversation_id"),source: form.get("source"),consent: form.get("consent") === "on" });
  if (!parsed.success) return { error: "Record the customer's consent source." };
  const { context } = await requireDashboardTenant();
  if (context.role !== "owner") return { error: "Only the owner can record outbound consent." };
  try { await recordWhatsAppConsent({ ...parsed.data,businessId: context.business.id,userId: context.userId }); }
  catch { return { error: "Unable to record consent." }; }
  revalidatePath(`/dashboard/contact-me/${parsed.data.conversationId}`);
  return { success: "Consent recorded. Conversation remains under human control." };
}

export async function syncWhatsAppTemplates(state: WhatsAppSettingsState, form: FormData): Promise<WhatsAppSettingsState> {
  void state; void form;
  const { context } = await requireDashboardTenant();
  if (context.role !== "owner") return { error: "Only the owner can refresh templates." };
  try {
    const count = await refreshWhatsAppTemplates(context.business.id,context.userId);
    revalidatePath("/dashboard/settings");
    return { success: `Refreshed ${count} templates from Meta.` };
  } catch { return { error: "Template refresh unavailable. Check WABA ID and the server credential configuration." }; }
}

export async function replyWithWhatsAppTemplate(_state: WhatsAppSettingsState, form: FormData): Promise<WhatsAppSettingsState> {
  const parsed = z.object({ conversationId: z.string().uuid(),name: z.string().regex(/^[a-z0-9_]{1,512}$/),language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),parameters: z.array(z.string().max(1000)).max(20),requestId: z.string().uuid() }).safeParse({ conversationId: form.get("conversation_id"),name: form.get("name"),language: form.get("language"),parameters: String(form.get("parameters") ?? "").split("\n").filter(Boolean),requestId: form.get("request_id") ?? randomUUID() });
  if (!parsed.success) return { error: "Check the approved template name, language and parameters." };
  const { context } = await requireDashboardTenant();
  try {
    await sendWhatsAppTemplate({ businessId: context.business.id,userId: context.userId,conversationId: parsed.data.conversationId,requestId: parsed.data.requestId,body: `[Template: ${parsed.data.name}]`,template: { name: parsed.data.name,language: parsed.data.language,parameters: parsed.data.parameters } });
  } catch { return { error: "Template could not be sent. Refresh Meta approvals and check recorded consent and opt-out state." }; }
  revalidatePath(`/dashboard/contact-me/${parsed.data.conversationId}`);
  return { success: "Template sent." };
}

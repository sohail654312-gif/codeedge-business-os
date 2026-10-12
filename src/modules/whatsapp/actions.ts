"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { whatsappConnectionSettingsSchema } from "./validation";

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

/**
 * Owner-only persistent draft controls. Enabling this NEVER enables provider
 * sends: the webhook creates reviewable suggestions only.
 */
export async function saveWhatsAppAutoReplySettings(
  _state: WhatsAppSettingsState,
  formData: FormData,
): Promise<WhatsAppSettingsState> {
  const rawLimit = String(formData.get("monthly_draft_limit") ?? "");
  const monthlyDraftLimit = Number(rawLimit);
  if (!/^\d{1,3}$/.test(rawLimit) ||
      !Number.isInteger(monthlyDraftLimit) ||
      monthlyDraftLimit < 1 || monthlyDraftLimit > 800) {
    return { error: "Choose a monthly draft limit between 1 and 800." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only a business owner can change automatic reply settings." };
  }

  const { error } = await client.from("whatsapp_auto_reply_settings").upsert({
    business_id: context.business.id,
    enabled: formData.get("enabled") === "on",
    monthly_draft_limit: monthlyDraftLimit,
  }, { onConflict: "business_id" });

  if (error) {
    return { error: "Unable to save automatic reply settings." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/contact-me");
  return { success: "Automatic reply draft settings saved. No messages are sent automatically." };
}

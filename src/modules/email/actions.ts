"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { emailConnectionSettingsSchema } from "./validation";

export type EmailSettingsState = {
  error?: string;
  success?: string;
};

export async function saveEmailSettings(
  _state: EmailSettingsState,
  formData: FormData,
): Promise<EmailSettingsState> {
  const parsed = emailConnectionSettingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    sender_name: formData.get("sender_name"),
    sender_email: formData.get("sender_email"),
    reply_to_email: formData.get("reply_to_email"),
    inbound_email: formData.get("inbound_email"),
    credential_key: formData.get("credential_key"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Email settings." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only a business owner can change Email settings." };
  }

  const existing = await client
    .from("channel_connections")
    .select("id")
    .eq("business_id", context.business.id)
    .eq("channel", "email")
    .eq("provider", "resend_email")
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load Email settings." };
  }

  const connectionValues = {
    external_account_id: "",
    external_sender_id: parsed.data.sender_email,
    display_address: parsed.data.sender_name || parsed.data.sender_email.slice(0, 120),
    credential_key: parsed.data.credential_key,
    enabled: false,
  };

  const connectionResult = existing.data
    ? await client
      .from("channel_connections")
      .update(connectionValues)
      .eq("business_id", context.business.id)
      .eq("id", existing.data.id)
      .select("id")
      .maybeSingle()
    : await client
      .from("channel_connections")
      .insert({
        business_id: context.business.id,
        channel: "email",
        provider: "resend_email",
        ...connectionValues,
      })
      .select("id")
      .single();

  if (connectionResult.error || !connectionResult.data) {
    return { error: "Unable to save Email connection settings." };
  }

  const connectionId = connectionResult.data.id;
  const settings = await client
    .from("email_channel_settings")
    .select("connection_id")
    .eq("business_id", context.business.id)
    .maybeSingle();

  if (settings.error) {
    return { error: "Unable to load Email channel settings." };
  }

  const settingsValues = {
    sender_name: parsed.data.sender_name,
    sender_email: parsed.data.sender_email,
    reply_to_email: parsed.data.reply_to_email,
    inbound_email: parsed.data.inbound_email,
  };

  const settingsResult = settings.data
    ? await client
      .from("email_channel_settings")
      .update(settingsValues)
      .eq("business_id", context.business.id)
      .eq("connection_id", connectionId)
      .select("connection_id")
      .maybeSingle()
    : await client
      .from("email_channel_settings")
      .insert({
        business_id: context.business.id,
        connection_id: connectionId,
        ...settingsValues,
      })
      .select("connection_id")
      .single();

  if (settingsResult.error || !settingsResult.data) {
    return { error: "Unable to save Email channel settings. The channel remains disabled." };
  }

  const enabledResult = await client
    .from("channel_connections")
    .update({ enabled: parsed.data.enabled })
    .eq("business_id", context.business.id)
    .eq("id", connectionId)
    .select("id")
    .maybeSingle();

  if (enabledResult.error || !enabledResult.data) {
    return { error: "Email settings were saved but the channel remains disabled." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/contact-me");
  return { success: "Email settings saved." };
}

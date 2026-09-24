"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { websiteChatSettingsSchema } from "./validation";

export type WebsiteChatSettingsState = {
  error?: string;
  success?: string;
};

export async function saveWebsiteChatSettings(
  _state: WebsiteChatSettingsState,
  formData: FormData,
): Promise<WebsiteChatSettingsState> {
  const parsed = websiteChatSettingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    widget_name: formData.get("widget_name"),
    launcher_label: formData.get("launcher_label"),
    greeting_text: formData.get("greeting_text"),
    welcome_message: formData.get("welcome_message"),
    offline_message: formData.get("offline_message"),
    lead_capture_enabled: formData.get("lead_capture_enabled") === "on",
    accent_color: formData.get("accent_color"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Website Chat settings." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only a business owner can change Website Chat settings." };
  }

  const existing = await client
    .from("website_chat_widgets")
    .select("business_id")
    .eq("business_id", context.business.id)
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load Website Chat settings." };
  }

  const result = existing.data
    ? await client
      .from("website_chat_widgets")
      .update(parsed.data)
      .eq("business_id", context.business.id)
      .select("public_id")
      .maybeSingle()
    : await client
      .from("website_chat_widgets")
      .insert({
        business_id: context.business.id,
        ...parsed.data,
      })
      .select("public_id")
      .single();

  if (result.error || !result.data) {
    return { error: "Unable to save Website Chat settings." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/contact-me");
  return { success: "Website Chat settings saved." };
}

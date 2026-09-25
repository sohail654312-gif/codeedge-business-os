"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { businessTimezoneSchema, settingsSchema } from "./validation";

export type SettingsState = {
  error?: string;
  success?: string;
};

function ownerOnly(role: "owner" | "staff"): SettingsState | null {
  return role === "owner" ? null : { error: "Only a business owner can change Business Settings." };
}

export async function saveBusinessSettings(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse({
    locale: formData.get("locale"),
    lead_notification_email: formData.get("lead_notification_email"),
    notify_new_leads: formData.get("notify_new_leads") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Business Settings." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const existing = await client
    .from("business_settings")
    .select("business_id")
    .eq("business_id", context.business.id)
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load the current Business Settings." };
  }

  const result = existing.data
    ? await client
      .from("business_settings")
      .update(parsed.data)
      .eq("business_id", context.business.id)
      .select("business_id")
      .maybeSingle()
    : await client
      .from("business_settings")
      .insert({ ...parsed.data, business_id: context.business.id })
      .select("business_id")
      .single();

  if (result.error || !result.data) {
    return { error: "Unable to save Business Settings. Check your owner access and try again." };
  }

  revalidatePath("/dashboard/settings");
  return { success: "Business Settings saved." };
}


export async function saveBusinessTimezone(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = businessTimezoneSchema.safeParse(formData.get("timezone"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the business timezone." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const result = await client
    .from("businesses")
    .update({ timezone: parsed.data })
    .eq("id", context.business.id)
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    return { error: "Unable to save the business timezone." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/contact-me/voice");
  return { success: "Business timezone saved." };
}

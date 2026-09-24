"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import {
  openingHoursSchema,
  serviceAreaIdSchema,
  serviceAreaSchema,
  weekdaySchema,
} from "./validation";

export type ServiceCoverageState = {
  error?: string;
  success?: string;
};

function ownerOnly(role: "owner" | "staff"): ServiceCoverageState | null {
  return role === "owner"
    ? null
    : { error: "Only a business owner can change Service Areas or Opening Hours." };
}

function revalidateCoverage() {
  revalidatePath("/dashboard/settings");
}

function parseArea(formData: FormData) {
  return serviceAreaSchema.safeParse({
    name: formData.get("name"),
    postcode: formData.get("postcode"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on",
    display_order: formData.get("display_order"),
  });
}

export async function createServiceArea(
  _state: ServiceCoverageState,
  formData: FormData,
): Promise<ServiceCoverageState> {
  const parsed = parseArea(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Service Area details." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("service_areas")
    .insert({ ...parsed.data, business_id: context.business.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Unable to create the Service Area. Check your owner access and try again." };
  }

  revalidateCoverage();
  return { success: "Service Area created." };
}

export async function updateServiceArea(
  _state: ServiceCoverageState,
  formData: FormData,
): Promise<ServiceCoverageState> {
  const id = serviceAreaIdSchema.safeParse(formData.get("service_area_id"));
  const parsed = parseArea(formData);

  if (!id.success || !parsed.success) {
    return {
      error: parsed.success
        ? "Invalid Service Area."
        : parsed.error.issues[0]?.message ?? "Check the Service Area details.",
    };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("service_areas")
    .update(parsed.data)
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Service Area unavailable in this workspace or could not be updated." };
  }

  revalidateCoverage();
  return { success: "Service Area saved." };
}

export async function deleteServiceArea(
  _state: ServiceCoverageState,
  formData: FormData,
): Promise<ServiceCoverageState> {
  const id = serviceAreaIdSchema.safeParse(formData.get("service_area_id"));
  if (!id.success) return { error: "Invalid Service Area." };

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("service_areas")
    .delete()
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Service Area unavailable in this workspace or could not be deleted." };
  }

  revalidateCoverage();
  return { success: "Service Area deleted." };
}

export async function saveOpeningHours(
  _state: ServiceCoverageState,
  formData: FormData,
): Promise<ServiceCoverageState> {
  const weekday = weekdaySchema.safeParse(formData.get("weekday"));
  const parsed = openingHoursSchema.safeParse({
    is_closed: formData.get("is_closed") === "on",
    opens_at: formData.get("opens_at"),
    closes_at: formData.get("closes_at"),
  });

  if (!weekday.success) {
    return { error: "Select a valid weekday." };
  }

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Opening Hours." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const existing = await client
    .from("opening_hours")
    .select("weekday")
    .eq("business_id", context.business.id)
    .eq("weekday", weekday.data)
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load the current Opening Hours." };
  }

  const result = existing.data
    ? await client
      .from("opening_hours")
      .update(parsed.data)
      .eq("business_id", context.business.id)
      .eq("weekday", weekday.data)
      .select("weekday")
      .maybeSingle()
    : await client
      .from("opening_hours")
      .insert({
        ...parsed.data,
        business_id: context.business.id,
        weekday: weekday.data,
      })
      .select("weekday")
      .single();

  if (result.error || !result.data) {
    return { error: "Unable to save Opening Hours. Check your owner access and try again." };
  }

  revalidateCoverage();
  return { success: "Opening Hours saved." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { businessProfileSchema, serviceIdSchema, serviceSchema } from "./validation";

export type BusinessInformationState = {
  error?: string;
  success?: string;
};

function revalidateBusinessInformation() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/buy-from-me/leads");
  revalidatePath("/dashboard/buy-from-me/leads/new");
}

function ownerOnly(role: "owner" | "staff"): BusinessInformationState | null {
  return role === "owner" ? null : { error: "Only a business owner can change Business Information." };
}

export async function saveBusinessProfile(
  _state: BusinessInformationState,
  formData: FormData,
): Promise<BusinessInformationState> {
  const parsed = businessProfileSchema.safeParse({
    trading_name: formData.get("trading_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    website: formData.get("website"),
    address: formData.get("address"),
    description: formData.get("description"),
    category: formData.get("category"),
    logo_alt: formData.get("logo_alt"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Business Profile details." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const existing = await client
    .from("business_profiles")
    .select("business_id")
    .eq("business_id", context.business.id)
    .maybeSingle();

  if (existing.error) {
    return { error: "Unable to load the current Business Profile." };
  }

  const result = existing.data
    ? await client
      .from("business_profiles")
      .update(parsed.data)
      .eq("business_id", context.business.id)
      .select("business_id")
      .maybeSingle()
    : await client
      .from("business_profiles")
      .insert({ ...parsed.data, business_id: context.business.id })
      .select("business_id")
      .single();

  if (result.error || !result.data) {
    return { error: "Unable to save the Business Profile. Check your owner access and try again." };
  }

  revalidateBusinessInformation();
  return { success: "Business Profile saved." };
}

function parseService(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active") === "on",
    quote_required: formData.get("quote_required") === "on",
    duration_minutes: formData.get("duration_minutes"),
    starting_price_gbp: formData.get("starting_price_gbp"),
    display_order: formData.get("display_order"),
  });
}

function serviceValues(data: z.infer<typeof serviceSchema>) {
  return {
    name: data.name,
    description: data.description,
    active: data.active,
    quote_required: data.quote_required,
    duration_minutes: data.duration_minutes,
    starting_price_pence: data.starting_price_gbp,
    display_order: data.display_order,
  };
}

export async function createService(
  _state: BusinessInformationState,
  formData: FormData,
): Promise<BusinessInformationState> {
  const parsed = parseService(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Service details." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("services")
    .insert({ ...serviceValues(parsed.data), business_id: context.business.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Unable to create the Service. Check your owner access and try again." };
  }

  revalidateBusinessInformation();
  return { success: "Service created." };
}

export async function updateService(
  _state: BusinessInformationState,
  formData: FormData,
): Promise<BusinessInformationState> {
  const id = serviceIdSchema.safeParse(formData.get("service_id"));
  const parsed = parseService(formData);

  if (!id.success || !parsed.success) {
    return { error: parsed.success ? "Invalid Service." : parsed.error.issues[0]?.message ?? "Check the Service details." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("services")
    .update(serviceValues(parsed.data))
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Service unavailable in this workspace or could not be updated." };
  }

  revalidateBusinessInformation();
  return { success: "Service saved." };
}

export async function deleteService(
  _state: BusinessInformationState,
  formData: FormData,
): Promise<BusinessInformationState> {
  const id = serviceIdSchema.safeParse(formData.get("service_id"));
  if (!id.success) return { error: "Invalid Service." };

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("services")
    .delete()
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Service unavailable in this workspace or could not be deleted." };
  }

  revalidateBusinessInformation();
  return { success: "Service deleted. Existing Leads keep their CRM history." };
}

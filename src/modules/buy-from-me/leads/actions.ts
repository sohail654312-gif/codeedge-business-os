"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { leadCreateFormSchema, leadEditFormSchema } from "./validation";
import { buildLeadInsert, buildLeadUpdate } from "./persistence";

export type LeadFormState = {
  error?: string;
};

async function validService(
  client: Awaited<ReturnType<typeof requireDashboardTenant>>["client"],
  businessId: string,
  serviceId: string | null,
) {
  if (!serviceId) return true;

  const { data, error } = await client
    .from("services")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function createLead(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadCreateFormSchema.safeParse({
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    source: formData.get("source"),
    service_id: formData.get("service_id"),
    enquiry_summary: formData.get("enquiry_summary"),
    estimated_value_gbp: formData.get("estimated_value_gbp"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Lead details." };
  }

  const { client, context } = await requireDashboardTenant();

  if (!await validService(client, context.business.id, parsed.data.service_id)) {
    return { error: "Select a valid active service for this business." };
  }

  const payload = buildLeadInsert(parsed.data, {
    businessId: context.business.id,
    userId: context.userId,
  });

  const { data: lead, error } = await client
    .from("leads")
    .insert(payload)
    .select("id")
    .single();

  if (error || !lead) {
    return { error: "Unable to save the Lead. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/buy-from-me");
  revalidatePath("/dashboard/buy-from-me/leads");
  redirect(`/dashboard/buy-from-me/leads/${lead.id}`);
}

export async function updateLead(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadEditFormSchema.safeParse({
    lead_id: formData.get("lead_id"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    source: formData.get("source"),
    service_id: formData.get("service_id"),
    enquiry_summary: formData.get("enquiry_summary"),
    estimated_value_gbp: formData.get("estimated_value_gbp"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Lead details." };
  }

  const { client, context } = await requireDashboardTenant();

  if (!await validService(client, context.business.id, parsed.data.service_id)) {
    return { error: "Select a valid active service for this business." };
  }

  const { lead_id, ...values } = parsed.data;
  const { data: lead, error } = await client
    .from("leads")
    .update(buildLeadUpdate(values))
    .eq("business_id", context.business.id)
    .eq("id", lead_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "Unable to update the Lead. Please try again." };
  }

  if (!lead) {
    return { error: "Lead unavailable in this workspace." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/buy-from-me");
  revalidatePath("/dashboard/buy-from-me/leads");
  revalidatePath(`/dashboard/buy-from-me/leads/${lead_id}`);
  redirect(`/dashboard/buy-from-me/leads/${lead_id}`);
}

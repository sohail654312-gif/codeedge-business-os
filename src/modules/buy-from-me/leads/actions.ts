"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { leadCreateFormSchema, leadEditFormSchema, leadNoteDeleteSchema, leadNoteFormSchema, leadStatusFormSchema } from "./validation";
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


export async function updateLeadStatus(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadStatusFormSchema.safeParse({
    lead_id: formData.get("lead_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Select a valid Lead status." };
  }

  const { client, context } = await requireDashboardTenant();

  const { data: lead, error } = await client
    .from("leads")
    .update({ status: parsed.data.status })
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.lead_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "Unable to update Lead status. Please try again." };
  }

  if (!lead) {
    return { error: "Lead unavailable in this workspace." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/buy-from-me");
  revalidatePath("/dashboard/buy-from-me/leads");
  revalidatePath(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}`);

  return {};
}


async function leadExistsInTenant(
  client: Awaited<ReturnType<typeof requireDashboardTenant>>["client"],
  businessId: string,
  leadId: string,
) {
  const { data, error } = await client
    .from("leads")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function addLeadNote(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadNoteFormSchema.safeParse({
    lead_id: formData.get("lead_id"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the note." };
  }

  const { client, context } = await requireDashboardTenant();

  if (!await leadExistsInTenant(client, context.business.id, parsed.data.lead_id)) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: note, error } = await client
    .from("lead_notes")
    .insert({
      business_id: context.business.id,
      lead_id: parsed.data.lead_id,
      body: parsed.data.body,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !note) {
    return { error: "Unable to add the note. Please try again." };
  }

  revalidatePath(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}`);
  redirect(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}#internal-notes`);
}

export async function deleteLeadNote(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadNoteDeleteSchema.safeParse({
    lead_id: formData.get("lead_id"),
    note_id: formData.get("note_id"),
  });

  if (!parsed.success) {
    return { error: "Invalid note request." };
  }

  const { client, context } = await requireDashboardTenant();

  if (context.role !== "owner") {
    return { error: "Only a business owner can delete internal notes." };
  }

  if (!await leadExistsInTenant(client, context.business.id, parsed.data.lead_id)) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: note, error } = await client
    .from("lead_notes")
    .delete()
    .eq("business_id", context.business.id)
    .eq("lead_id", parsed.data.lead_id)
    .eq("id", parsed.data.note_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "Unable to delete the note. Please try again." };
  }

  if (!note) {
    return { error: "Note unavailable in this workspace." };
  }

  revalidatePath(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}`);
  redirect(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}#internal-notes`);
}

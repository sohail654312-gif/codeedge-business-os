"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { erpnextCustomerAdapter } from "@/integrations/customers";
import { getERPNextConfig } from "@/integrations/erpnext";
import { syncCustomerBackOffice } from "@/modules/buy-from-me/customers/sync";
import { leadConversionSchema, leadCreateFormSchema, leadEditFormSchema, leadNoteDeleteSchema, leadNoteFormSchema, leadStatusFormSchema, quoteRequestCreateFormSchema, quoteRequestStatusFormSchema } from "./validation";
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


export async function createQuoteRequest(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = quoteRequestCreateFormSchema.safeParse({
    lead_id: formData.get("lead_id"),
    details: formData.get("details"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Quote Request details." };
  }

  const { client, context } = await requireDashboardTenant();

  if (!await leadExistsInTenant(client, context.business.id, parsed.data.lead_id)) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: quote, error } = await client
    .from("quote_requests")
    .insert({
      business_id: context.business.id,
      lead_id: parsed.data.lead_id,
      details: parsed.data.details,
      status: "requested",
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !quote) {
    return { error: "Unable to create the Quote Request. Please try again." };
  }

  revalidatePath(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}`);
  redirect(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}#quote-requests`);
}

export async function updateQuoteRequestStatus(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = quoteRequestStatusFormSchema.safeParse({
    lead_id: formData.get("lead_id"),
    quote_request_id: formData.get("quote_request_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Select a valid Quote Request status." };
  }

  const { client, context } = await requireDashboardTenant();

  if (!await leadExistsInTenant(client, context.business.id, parsed.data.lead_id)) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: quote, error } = await client
    .from("quote_requests")
    .update({ status: parsed.data.status })
    .eq("business_id", context.business.id)
    .eq("lead_id", parsed.data.lead_id)
    .eq("id", parsed.data.quote_request_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "Unable to update the Quote Request. Please try again." };
  }

  if (!quote) {
    return { error: "Quote Request unavailable in this workspace." };
  }

  revalidatePath(`/dashboard/buy-from-me/leads/${parsed.data.lead_id}`);
  return {};
}


export async function convertLeadToCustomer(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState & { success?: string }> {
  const parsed = leadConversionSchema.safeParse({
    lead_id: formData.get("lead_id"),
  });

  if (!parsed.success) {
    return { error: "Invalid Lead conversion request." };
  }

  const { client, context } = await requireDashboardTenant();

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id,contact_name,phone,email")
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: conversionRows, error: conversionError } = await client
    .rpc("convert_lead_to_customer", { target_lead_id: lead.id });

  const conversion = conversionRows?.[0];
  if (conversionError || !conversion) {
    return { error: "Unable to convert this Lead. Please try again." };
  }

  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id,contact_name,phone,email,erpnext_customer_id,erpnext_sync_status")
    .eq("business_id", context.business.id)
    .eq("id", conversion.customer_id)
    .maybeSingle();

  if (customerError || !customer) {
    return { error: "Customer conversion completed, but the Customer could not be reloaded." };
  }

  let syncMessage = "";
  if (!customer.erpnext_customer_id && getERPNextConfig()) {
    const sync = await syncCustomerBackOffice(erpnextCustomerAdapter, {
      businessId: context.business.id,
      customerId: customer.id,
      name: customer.contact_name,
      phone: customer.phone,
      email: customer.email,
    });

    const nextStatus = sync.status === "synced" ? "synced" : "failed";
    const { error: syncUpdateError } = await client
      .from("customers")
      .update({
        erpnext_customer_id: sync.externalId,
        erpnext_sync_status: nextStatus,
      })
      .eq("business_id", context.business.id)
      .eq("id", customer.id);

    if (syncUpdateError) {
      syncMessage = " Back-office sync status could not be saved.";
    } else {
      syncMessage = sync.status === "synced"
        ? " ERPNext sync completed."
        : " ERPNext is currently unavailable; the CodeEdge Customer is safe and can be synced later.";
    }
  } else if (!customer.erpnext_customer_id) {
    syncMessage = " ERPNext is not configured; the Customer is safely stored in CodeEdge CRM.";
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/buy-from-me/customers");
  revalidatePath(`/dashboard/buy-from-me/leads/${lead.id}`);

  return {
    success: conversion.created
      ? `Lead converted to Customer.${syncMessage}`
      : `This Lead was already converted; no duplicate Customer was created.${syncMessage}`,
  };
}

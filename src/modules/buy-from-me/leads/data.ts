import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Database, Lead, LeadNote, QuoteRequest, Service } from "@/types/database";
import type { LeadFilters } from "./validation";

export type LeadWithService = Lead & {
  service_name: string | null;
};

async function serviceNames(
  client: SupabaseClient<Database>,
  businessId: string,
  serviceIds: Array<string | null>,
) {
  const ids = [...new Set(serviceIds.filter((value): value is string => Boolean(value)))];
  if (!ids.length) return new Map<string, string>();

  const { data, error } = await client
    .from("services")
    .select("id,name")
    .eq("business_id", businessId)
    .in("id", ids);

  if (error) throw new Error("Unable to load Lead services.");
  return new Map((data ?? []).map((service) => [service.id, service.name]));
}

export async function listLeads(
  client: SupabaseClient<Database>,
  businessId: string,
  filters: LeadFilters = { q: null, status: null, source: null, service_id: null },
): Promise<LeadWithService[]> {
  const { data, error } = await client.rpc("search_leads", {
    p_business_id: businessId,
    p_query: filters.q,
    p_status: filters.status,
    p_source: filters.source,
    p_service_id: filters.service_id,
  });

  if (error) throw new Error("Unable to load Leads.");

  const leads = data ?? [];
  const names = await serviceNames(client, businessId, leads.map((lead) => lead.service_id));
  return leads.map((lead) => ({
    ...lead,
    service_name: lead.service_id ? names.get(lead.service_id) ?? null : null,
  }));
}

export async function getLead(
  client: SupabaseClient<Database>,
  businessId: string,
  leadId: string,
): Promise<LeadWithService | null> {
  const { data: lead, error } = await client
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error("Unable to load Lead.");
  if (!lead) return null;

  let serviceName: string | null = null;
  if (lead.service_id) {
    const { data: service, error: serviceError } = await client
      .from("services")
      .select("name")
      .eq("business_id", businessId)
      .eq("id", lead.service_id)
      .maybeSingle();

    if (serviceError) throw new Error("Unable to load Lead service.");
    serviceName = service?.name ?? null;
  }

  return { ...lead, service_name: serviceName };
}

export async function listActiveServices(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<Array<Pick<Service, "id" | "name">>> {
  const { data, error } = await client
    .from("services")
    .select("id,name")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error("Unable to load services.");
  return data ?? [];
}

export function formatLeadValue(pence: number | null) {
  if (pence === null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export function formatLeadDate(value: string | null) {
  if (!value) return "Not contacted";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}


export async function listLeadNotes(
  client: SupabaseClient<Database>,
  businessId: string,
  leadId: string,
): Promise<LeadNote[]> {
  const { data, error } = await client
    .from("lead_notes")
    .select("*")
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load Lead notes.");
  return data ?? [];
}

export function formatNoteDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}


export async function listQuoteRequests(
  client: SupabaseClient<Database>,
  businessId: string,
  leadId: string,
): Promise<QuoteRequest[]> {
  const { data, error } = await client
    .from("quote_requests")
    .select("*")
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load Quote Requests.");
  return data ?? [];
}


export async function getLeadCustomer(
  client: SupabaseClient<Database>,
  businessId: string,
  leadId: string,
): Promise<Customer | null> {
  const { data, error } = await client
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("source_lead_id", leadId)
    .maybeSingle();

  if (error) throw new Error("Unable to load converted Customer.");
  return data;
}

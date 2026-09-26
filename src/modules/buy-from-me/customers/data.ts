import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Database } from "@/types/database";
import type { CustomerFilters } from "./validation";

export type CustomerRow = {
  id: string;
  name: string;
  company: string;
  contact: string;
  status: string;
  source: string;
  value: string;
  lastActivity: string;
};
export type CustomerDirectoryData = {
  rows: CustomerRow[];
  mode: "crm" | "erpnext" | "hybrid";
  note: string;
};

function localRow(customer: Customer): CustomerRow {
  const converted = Boolean(customer.source_lead_id);
  return {
    id: customer.id,
    name: customer.contact_name,
    company: "Codeedge CRM Customer",
    contact: customer.email || customer.phone || "—",
    status: "Active",
    source: converted
      ? customer.erpnext_customer_id ? "Lead conversion + Finance" : "Lead conversion"
      : "Direct CRM",
    value: "—",
    lastActivity: customer.erpnext_customer_id
      ? "Finance engine mapping available"
      : converted ? "Converted from Lead" : "Created directly in CRM",
  };
}

export async function getCustomerDirectoryData(
  client: SupabaseClient<Database>,
  businessId: string,
  filters: CustomerFilters = { q: null, source: null },
): Promise<CustomerDirectoryData> {
  const { data, error } = await client.rpc("search_customers", {
    p_business_id: businessId,
    p_query: filters.q,
    p_source: filters.source,
  });
  if (error) throw new Error("Unable to load Codeedge Customers.");

  const rows = (data ?? []).map(localRow);
  return {
    rows,
    mode: "crm",
    note: rows.length
      ? "Codeedge CRM remains the canonical Customer identity. Finance engines are linked through Codeedge Money."
      : filters.q || filters.source
        ? "No Customers match these filters."
        : "No Customers yet. Create one directly or convert a Lead.",
  };
}

export async function getCustomer(
  client: SupabaseClient<Database>,
  businessId: string,
  customerId: string,
): Promise<Customer | null> {
  const { data, error } = await client.from("customers").select("*")
    .eq("business_id", businessId).eq("id", customerId).maybeSingle();
  if (error) throw new Error("Unable to load Customer.");
  return data;
}

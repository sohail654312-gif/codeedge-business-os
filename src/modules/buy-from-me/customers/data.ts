import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Database } from "@/types/database";

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
  return {
    id: customer.id,
    name: customer.contact_name,
    company: "Codeedge CRM Customer",
    contact: customer.email || customer.phone || "—",
    status: "Active",
    source: customer.erpnext_customer_id ? "Codeedge + Finance" : "Codeedge CRM",
    value: "—",
    lastActivity: customer.erpnext_customer_id
      ? "Finance engine mapping available"
      : "Converted from Lead",
  };
}

export async function getCustomerDirectoryData(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<CustomerDirectoryData> {
  const { data: localCustomers,error } = await client
    .from("customers")
    .select("*")
    .eq("business_id",businessId)
    .order("created_at",{ ascending:false });

  if (error) throw new Error("Unable to load Codeedge Customers.");

  const rows = (localCustomers ?? []).map(localRow);
  return {
    rows,
    mode:"crm",
    note: rows.length
      ? "Codeedge CRM remains the canonical Customer identity. Finance engines are linked through Codeedge Money."
      : "No Customers yet. Convert a Lead to create the first Customer.",
  };
}

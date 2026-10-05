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
  total: number;
  page: number;
  pageSize: number;
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
      : customer.source_lead_id ? "Converted from Lead" : "Created in CRM",
  };
}

export async function getCustomerDirectoryData(
  client: SupabaseClient<Database>,
  businessId: string,
  query: string | null = null,
  page: number = 1,
): Promise<CustomerDirectoryData> {
  const { data,error } = await client.rpc("search_customers_page",{ p_business_id:businessId,p_query:query,p_page:page });

  if (error || !data) throw new Error("Unable to load Codeedge Customers.");

  const rows = data.rows.map(localRow);
  return {
    rows,
    total:data.total,page:data.page,pageSize:data.pageSize,
    mode:"crm",
    note: rows.length
      ? "Codeedge CRM remains the canonical Customer identity. Finance engines are linked through Codeedge Money."
      : "Add a Customer or convert a Lead. Search remains scoped to this workspace.",
  };
}

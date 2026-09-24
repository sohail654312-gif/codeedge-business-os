import type { SupabaseClient } from "@supabase/supabase-js";
import { getERPNextConfig, listERPNextCustomers } from "@/integrations/erpnext";
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
    company: "CodeEdge CRM Customer",
    contact: customer.email || customer.phone || "—",
    status: "Active",
    source: customer.erpnext_customer_id ? "CodeEdge + ERPNext" : "CodeEdge CRM",
    value: "—",
    lastActivity: customer.erpnext_customer_id ? "ERPNext synced" : "Converted from Lead",
  };
}

export async function getCustomerDirectoryData(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<CustomerDirectoryData> {
  const { data: localCustomers, error } = await client
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load CodeEdge Customers.");

  const local = localCustomers ?? [];
  const localRows = local.map(localRow);

  if (!getERPNextConfig()) {
    return {
      rows: localRows,
      mode: "crm",
      note: localRows.length
        ? "CodeEdge CRM Customers are stored in the tenant-secured SaaS core."
        : "No Customers yet. Convert a Lead to create the first Customer.",
    };
  }

  try {
    const result = await listERPNextCustomers(50);
    const linkedExternalIds = new Set(
      local.map((customer) => customer.erpnext_customer_id).filter((value): value is string => Boolean(value)),
    );

    const externalRows: CustomerRow[] = result.data
      .filter((customer) => !linkedExternalIds.has(customer.name))
      .map((customer) => ({
        id: `erpnext:${customer.name}`,
        name: customer.customer_name || customer.name,
        company: customer.customer_group || customer.customer_type || "Customer",
        contact: customer.territory || "ERPNext customer record",
        status: "Active",
        source: "ERPNext",
        value: "—",
        lastActivity: "ERPNext",
      }));

    return {
      rows: [...localRows, ...externalRows],
      mode: localRows.length ? "hybrid" : "erpnext",
      note: localRows.length
        ? "CodeEdge CRM Customers are combined with unmatched ERPNext customer records."
        : "Customer records are being read from ERPNext through the replaceable adapter.",
    };
  } catch {
    return {
      rows: localRows,
      mode: "crm",
      note: "ERPNext could not be reached. CodeEdge CRM Customers remain available safely.",
    };
  }
}

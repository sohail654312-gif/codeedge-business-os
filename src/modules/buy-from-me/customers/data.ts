import { customers as demoCustomers } from "@/data/demo";
import { getERPNextConfig, listERPNextCustomers } from "@/integrations/erpnext";

export type CustomerRow = {
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
  mode: "erpnext" | "demo";
  note: string;
};

export async function getCustomerDirectoryData(): Promise<CustomerDirectoryData> {
  if (!getERPNextConfig()) {
    return {
      rows: demoCustomers,
      mode: "demo",
      note: "ERPNext is not configured, so CodeEdge is showing demo customers.",
    };
  }

  try {
    const result = await listERPNextCustomers(50);

    return {
      rows: result.data.map((customer) => ({
        name: customer.customer_name || customer.name,
        company: customer.customer_group || customer.customer_type || "Customer",
        contact: customer.territory || "ERPNext customer record",
        status: "Active",
        source: "ERPNext",
        value: "—",
        lastActivity: "Synced",
      })),
      mode: "erpnext",
      note: "Customer records are being read from ERPNext through the CodeEdge adapter.",
    };
  } catch {
    return {
      rows: demoCustomers,
      mode: "demo",
      note: "ERPNext could not be reached, so CodeEdge safely fell back to demo customers.",
    };
  }
}

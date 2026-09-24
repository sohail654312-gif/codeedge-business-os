import { getERPNextConfig } from "./config";
import type {
  ERPNextCustomer,
  ERPNextDocumentResponse,
  ERPNextLead,
  ERPNextListResponse,
  ERPNextQuotation,
  ERPNextSalesInvoice,
} from "./types";

function buildHeaders() {
  const config = getERPNextConfig();
  if (!config) throw new Error("ERPNext is not configured.");

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `token ${config.apiKey}:${config.apiSecret}`,
  };
}

async function erpnextFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getERPNextConfig();
  if (!config) throw new Error("ERPNext is not configured.");

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ERPNext request failed (${response.status}): ${message.slice(0, 240)}`);
  }

  return response.json() as Promise<T>;
}

export async function getERPNextAuthenticatedUser() {
  const result = await erpnextFetch<{ message: string }>("/api/method/frappe.auth.get_logged_user");
  return result.message;
}

export async function listERPNextCustomers(limit = 20) {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "customer_name", "customer_type", "customer_group", "territory"]),
    limit_page_length: String(limit),
  });
  return erpnextFetch<ERPNextListResponse<ERPNextCustomer>>(`/api/resource/Customer?${query.toString()}`);
}

export async function listERPNextSalesInvoices(limit = 20) {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "customer", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "status", "currency"]),
    limit_page_length: String(limit),
    order_by: "posting_date desc",
  });
  return erpnextFetch<ERPNextListResponse<ERPNextSalesInvoice>>(`/api/resource/Sales Invoice?${query.toString()}`);
}

export async function listERPNextLeads(limit = 20) {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "lead_name", "company_name", "email_id", "mobile_no", "status", "source"]),
    limit_page_length: String(limit),
  });
  return erpnextFetch<ERPNextListResponse<ERPNextLead>>(`/api/resource/Lead?${query.toString()}`);
}

export async function listERPNextQuotations(limit = 20) {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "party_name", "transaction_date", "valid_till", "grand_total", "status", "currency"]),
    limit_page_length: String(limit),
    order_by: "transaction_date desc",
  });
  return erpnextFetch<ERPNextListResponse<ERPNextQuotation>>(`/api/resource/Quotation?${query.toString()}`);
}

export async function getERPNextDocument<T>(doctype: string, name: string) {
  const safeDoctype = encodeURIComponent(doctype);
  const safeName = encodeURIComponent(name);
  return erpnextFetch<ERPNextDocumentResponse<T>>(`/api/resource/${safeDoctype}/${safeName}`);
}

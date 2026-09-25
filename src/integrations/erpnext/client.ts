import { getERPNextConfig, type ERPNextConfig } from "./config";
import type {
  ERPNextCustomer,
  ERPNextCustomerCreateInput,
  ERPNextDocumentResponse,
  ERPNextLead,
  ERPNextListResponse,
  ERPNextQuotation,
  ERPNextSalesInvoice,
  ERPNextSupplier,
} from "./types";

export class ERPNextRequestError extends Error {
  constructor(
    public readonly code:
      | "erpnext_not_configured"
      | "erpnext_unauthorized"
      | "erpnext_not_found"
      | "erpnext_rate_limited"
      | "erpnext_request_failed"
      | "erpnext_invalid_response",
    public readonly status: number | null = null,
  ) {
    super("ERPNext request failed.");
    this.name = "ERPNextRequestError";
  }
}

function headers(config: ERPNextConfig) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `token ${config.apiKey}:${config.apiSecret}`,
  };
}

function normalizeStatus(status: number) {
  if (status === 401 || status === 403) return "erpnext_unauthorized" as const;
  if (status === 404) return "erpnext_not_found" as const;
  if (status === 429) return "erpnext_rate_limited" as const;
  return "erpnext_request_failed" as const;
}

export function createERPNextClient(
  config: ERPNextConfig,
  fetcher: typeof fetch = fetch,
) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers(config),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      // Never propagate provider response bodies: they can contain sensitive
      // Frappe diagnostics, stack traces or provider data.
      throw new ERPNextRequestError(normalizeStatus(response.status), response.status);
    }

    try {
      return await response.json() as T;
    } catch {
      throw new ERPNextRequestError("erpnext_invalid_response", response.status);
    }
  }

  function listResource<T>(
    doctype: string,
    fields: string[],
    limit: number,
    orderBy?: string,
  ) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_page_length: String(Math.max(1,Math.min(limit,100))),
    });
    if (orderBy) query.set("order_by",orderBy);
    return request<ERPNextListResponse<T>>(
      `/api/resource/${encodeURIComponent(doctype)}?${query.toString()}`,
    );
  }

  return {
    async getAuthenticatedUser() {
      const result = await request<{ message: string }>(
        "/api/method/frappe.auth.get_logged_user",
      );
      return result.message;
    },

    listCustomers(limit = 20) {
      return listResource<ERPNextCustomer>(
        "Customer",
        ["name","customer_name","customer_type","customer_group","territory"],
        limit,
      );
    },

    listSuppliers(limit = 20) {
      return listResource<ERPNextSupplier>(
        "Supplier",
        ["name","supplier_name","supplier_group","supplier_type","country"],
        limit,
      );
    },

    listLeads(limit = 20) {
      return listResource<ERPNextLead>(
        "Lead",
        ["name","lead_name","company_name","email_id","mobile_no","status","source"],
        limit,
      );
    },

    listQuotations(limit = 20) {
      return listResource<ERPNextQuotation>(
        "Quotation",
        ["name","party_name","transaction_date","valid_till","grand_total","status","currency"],
        limit,
        "transaction_date desc",
      );
    },

    listSalesInvoices(limit = 20) {
      return listResource<ERPNextSalesInvoice>(
        "Sales Invoice",
        ["name","customer","customer_name","posting_date","due_date","grand_total","outstanding_amount","status","currency"],
        limit,
        "posting_date desc",
      );
    },

    async getDocument<T>(doctype: string, name: string) {
      return request<ERPNextDocumentResponse<T>>(
        `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      );
    },

    async getCustomerByName(name: string) {
      const query = new URLSearchParams({
        fields: JSON.stringify(["name","customer_name","customer_type","customer_group","territory"]),
        filters: JSON.stringify([["name","=",name]]),
        limit_page_length: "1",
      });
      const result = await request<ERPNextListResponse<ERPNextCustomer>>(
        `/api/resource/Customer?${query.toString()}`,
      );
      return result.data[0] ?? null;
    },

    createCustomer(input: ERPNextCustomerCreateInput) {
      return request<ERPNextDocumentResponse<ERPNextCustomer>>(
        "/api/resource/Customer",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
  };
}

function legacyClient() {
  const config = getERPNextConfig();
  if (!config) throw new ERPNextRequestError("erpnext_not_configured");
  return createERPNextClient(config);
}

// Compatibility exports. New Codeedge Money production paths use FinanceEngine.
export async function getERPNextAuthenticatedUser() {
  return legacyClient().getAuthenticatedUser();
}
export async function listERPNextCustomers(limit = 20) {
  return legacyClient().listCustomers(limit);
}
export async function listERPNextSuppliers(limit = 20) {
  return legacyClient().listSuppliers(limit);
}
export async function listERPNextSalesInvoices(limit = 20) {
  return legacyClient().listSalesInvoices(limit);
}
export async function listERPNextLeads(limit = 20) {
  return legacyClient().listLeads(limit);
}
export async function listERPNextQuotations(limit = 20) {
  return legacyClient().listQuotations(limit);
}
export async function getERPNextDocument<T>(doctype: string, name: string) {
  return legacyClient().getDocument<T>(doctype,name);
}
export async function getERPNextCustomerByName(name: string) {
  return legacyClient().getCustomerByName(name);
}
export async function createERPNextCustomer(input: ERPNextCustomerCreateInput) {
  return legacyClient().createCustomer(input);
}

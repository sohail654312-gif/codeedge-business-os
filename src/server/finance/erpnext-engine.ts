import "server-only";

import { createERPNextClient } from "@/integrations/erpnext/client";
import type {
  ERPNextQuotation,
  ERPNextSalesInvoice,
} from "@/integrations/erpnext/types";
import type { ERPNextFinanceCredential } from "./credentials";
import { financeEngineMetadata } from "./provider-metadata";
import { decimalMoneySchema } from "./domain";
import type {
  CreateFinanceCustomerInput,
  FinanceEngine,
} from "./engine";

function money(value: number | undefined) {
  const raw = String(value ?? 0);
  return decimalMoneySchema.parse(raw);
}

export function normalizeERPNextQuoteStatus(
  status: string | undefined,
): "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled" {
  switch ((status ?? "").toLowerCase()) {
    case "draft": return "draft";
    case "open":
    case "replied": return "sent";
    case "ordered": return "accepted";
    case "lost": return "rejected";
    case "expired": return "expired";
    case "cancelled": return "cancelled";
    default: throw new Error("finance_erpnext_quote_status_unsupported");
  }
}

export function normalizeERPNextInvoiceStatus(
  status: string | undefined,
): "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void" {
  switch ((status ?? "").toLowerCase()) {
    case "draft": return "draft";
    case "unpaid":
    case "submitted":
    case "overdue and discounted": return "issued";
    case "partly paid":
    case "partially paid": return "partially_paid";
    case "paid": return "paid";
    case "overdue": return "overdue";
    case "cancelled":
    case "return":
    case "credit note issued": return "void";
    default: throw new Error("finance_erpnext_invoice_status_unsupported");
  }
}

function quote(row: ERPNextQuotation) {
  return {
    id: row.name,
    customerId: row.party_name ?? "",
    status: normalizeERPNextQuoteStatus(row.status),
    currency: row.currency ?? "",
    total: money(row.grand_total),
    externalRef: row.name,
    createdAt: row.transaction_date
      ? new Date(`${row.transaction_date}T00:00:00Z`).toISOString()
      : new Date(0).toISOString(),
    validUntil: row.valid_till
      ? new Date(`${row.valid_till}T00:00:00Z`).toISOString()
      : null,
  };
}

function invoice(row: ERPNextSalesInvoice) {
  return {
    id: row.name,
    customerId: row.customer ?? "",
    status: normalizeERPNextInvoiceStatus(row.status),
    currency: row.currency ?? "",
    total: money(row.grand_total),
    outstanding: money(row.outstanding_amount),
    externalRef: row.name,
    issuedAt: row.posting_date
      ? new Date(`${row.posting_date}T00:00:00Z`).toISOString()
      : null,
    dueAt: row.due_date
      ? new Date(`${row.due_date}T00:00:00Z`).toISOString()
      : null,
  };
}

export function createERPNextFinanceEngine(
  credential: ERPNextFinanceCredential,
  fetcher: typeof fetch = fetch,
): FinanceEngine {
  const client = createERPNextClient(credential,fetcher);

  return {
    id: "erpnext",
    capabilities: new Set(financeEngineMetadata.erpnext.capabilities),

    async getStatus() {
      await client.getAuthenticatedUser();
      return { ok: true, engine: "erpnext", message: "ERPNext connection ready." };
    },

    async listCustomers() {
      const result = await client.listCustomers(100);
      return result.data.map((row) => ({
        id: row.name,
        crmCustomerId: null,
        name: row.customer_name ?? row.name,
        email: "",
        phone: "",
        externalRef: row.name,
      }));
    },

    async resolveCustomer(_context, crmCustomerId) {
      const reference = `CE-CUST-${crmCustomerId}`;
      const row = await client.getCustomerByName(reference);
      if (!row) return null;
      return {
        id: row.name,
        crmCustomerId,
        name: row.customer_name ?? row.name,
        email: "",
        phone: "",
        externalRef: row.name,
      };
    },

    async createCustomer(_context, input: CreateFinanceCustomerInput) {
      if (!credential.customerGroup || !credential.territory) {
        throw new Error("finance_erpnext_customer_config_incomplete");
      }

      const reference = `CE-CUST-${input.crmCustomerId}`;
      const existing = await client.getCustomerByName(reference);
      if (existing) {
        return {
          id: existing.name,
          crmCustomerId: input.crmCustomerId,
          name: existing.customer_name ?? input.name,
          email: input.email,
          phone: input.phone,
          externalRef: existing.name,
        };
      }

      const created = await client.createCustomer({
        name: reference,
        customer_name: input.name,
        customer_type: "Individual",
        customer_group: credential.customerGroup,
        territory: credential.territory,
      });

      return {
        id: created.data.name,
        crmCustomerId: input.crmCustomerId,
        name: created.data.customer_name ?? input.name,
        email: input.email,
        phone: input.phone,
        externalRef: created.data.name,
      };
    },

    async listSuppliers() {
      const result = await client.listSuppliers(100);
      return result.data.map((row) => ({
        id: row.name,
        name: row.supplier_name ?? row.name,
        email: "",
        phone: "",
        externalRef: row.name,
      }));
    },

    async listQuotes() {
      const result = await client.listQuotations(100);
      return result.data.map(quote);
    },

    async listInvoices() {
      const result = await client.listSalesInvoices(100);
      return result.data.map(invoice);
    },
  };
}

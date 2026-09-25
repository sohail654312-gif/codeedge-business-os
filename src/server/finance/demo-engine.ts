import "server-only";

import { z } from "zod";
import {
  addMoney,
  currencyCodeSchema,
  decimalMoneySchema,
  minorUnitsToMoney,
  moneyToMinorUnits,
  type FinanceAccount,
  type FinanceBill,
  type FinanceCustomer,
  type FinanceDashboard,
  type FinanceExpense,
  type FinanceInvoice,
  type FinanceLedgerRow,
  type FinancePayment,
  type FinanceQuote,
  type FinanceReport,
  type FinanceSupplier,
  type FinanceTrialBalanceRow,
} from "./domain";
import type {
  CreateFinanceBillInput,
  CreateFinanceCustomerInput,
  CreateFinanceExpenseInput,
  CreateFinanceInvoiceInput,
  CreateFinanceQuoteInput,
  CreateFinanceSupplierInput,
  FinanceEngine,
  RecordFinancePaymentInput,
} from "./engine";
import { withFinanceCapability } from "./capability";

const requestIdSchema = z.string().uuid();

const demoDocumentSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  document_type: z.enum([
    "customer","supplier","quote","invoice","payment","bill","expense",
  ]),
  request_id: z.string().uuid(),
  crm_customer_id: z.string().uuid().nullable(),
  linked_document_id: z.string().uuid().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  status: z.string(),
  currency: currencyCodeSchema,
  amount: z.union([z.string(),z.number()]).transform(String),
  outstanding: z.union([z.string(),z.number()]).transform(String),
  category: z.string(),
  valid_until: z.string().nullable(),
  due_at: z.string().nullable(),
  incurred_at: z.string().nullable(),
  created_at: z.string(),
});

type DemoDocument = z.infer<typeof demoDocumentSchema>;

async function listDocuments(
  businessId: string,
  documentType: DemoDocument["document_type"],
) {
  return withFinanceCapability(async (db) => {
    const result = await db.query(
      "select * from public.finance_demo_list_documents($1,$2)",
      [businessId,documentType],
    );
    return z.array(demoDocumentSchema).parse(result.rows);
  });
}

async function upsertDocument(input: {
  businessId: string;
  documentType: DemoDocument["document_type"];
  requestId: string;
  crmCustomerId?: string | null;
  linkedDocumentId?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  currency: string;
  amount?: string;
  outstanding?: string;
  category?: string;
  validUntil?: string | null;
  dueAt?: string | null;
  incurredAt?: string | null;
}) {
  const requestId = requestIdSchema.parse(input.requestId);
  const currency = currencyCodeSchema.parse(input.currency);
  const amount = decimalMoneySchema.parse(input.amount ?? "0.00");
  const outstanding = decimalMoneySchema.parse(input.outstanding ?? "0.00");

  return withFinanceCapability(async (db) => {
    const result = await db.query<{ finance_demo_upsert_document: string }>(
      "select public.finance_demo_upsert_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12::numeric,$13,$14,$15,$16)",
      [
        input.businessId,
        input.documentType,
        requestId,
        input.crmCustomerId ?? null,
        input.linkedDocumentId ?? null,
        input.name ?? "",
        input.email ?? "",
        input.phone ?? "",
        input.status ?? "",
        currency,
        amount,
        outstanding,
        input.category ?? "",
        input.validUntil ?? null,
        input.dueAt ?? null,
        input.incurredAt ?? null,
      ],
    );
    const id = result.rows[0]?.finance_demo_upsert_document;
    if (!id) throw new Error("finance_demo_write_failed");
    return id;
  });
}

function financeCustomerFromDemo(row: DemoDocument): FinanceCustomer {
  return {
    id: row.id,
    crmCustomerId: row.crm_customer_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    externalRef: `demo:${row.id}`,
  };
}

function financeSupplierFromDemo(row: DemoDocument): FinanceSupplier {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    externalRef: `demo:${row.id}`,
  };
}

function financeQuoteFromDemo(row: DemoDocument): FinanceQuote {
  return {
    id: row.id,
    customerId: row.linked_document_id ?? "",
    status: z.enum(["draft","sent","accepted","rejected","expired","cancelled"])
      .parse(row.status),
    currency: row.currency,
    total: decimalMoneySchema.parse(row.amount),
    externalRef: `demo:${row.id}`,
    createdAt: row.created_at,
    validUntil: row.valid_until,
  };
}

function financeInvoiceFromDemo(row: DemoDocument): FinanceInvoice {
  return {
    id: row.id,
    customerId: row.crm_customer_id ?? "",
    status: z.enum(["draft","issued","partially_paid","paid","overdue","void"])
      .parse(row.status),
    currency: row.currency,
    total: decimalMoneySchema.parse(row.amount),
    outstanding: decimalMoneySchema.parse(row.outstanding),
    externalRef: `demo:${row.id}`,
    issuedAt: row.created_at,
    dueAt: row.due_at,
  };
}

function financePaymentFromDemo(row: DemoDocument): FinancePayment {
  return {
    id: row.id,
    invoiceId: row.linked_document_id ?? "",
    status: z.enum(["pending","posted","failed","reversed"]).parse(row.status),
    currency: row.currency,
    amount: decimalMoneySchema.parse(row.amount),
    externalRef: `demo:${row.id}`,
    recordedAt: row.created_at,
  };
}

function financeBillFromDemo(row: DemoDocument): FinanceBill {
  return {
    id: row.id,
    supplierId: row.linked_document_id ?? "",
    status: z.enum(["draft","open","partially_paid","paid","overdue","void"])
      .parse(row.status),
    currency: row.currency,
    total: decimalMoneySchema.parse(row.amount),
    outstanding: decimalMoneySchema.parse(row.outstanding),
    externalRef: `demo:${row.id}`,
    dueAt: row.due_at,
  };
}

function financeExpenseFromDemo(row: DemoDocument): FinanceExpense {
  return {
    id: row.id,
    supplierId: row.linked_document_id,
    category: row.category,
    currency: row.currency,
    amount: decimalMoneySchema.parse(row.amount),
    externalRef: `demo:${row.id}`,
    incurredAt: row.incurred_at ?? row.created_at,
  };
}

function assertDemo(context: Parameters<FinanceEngine["getStatus"]>[0]) {
  if (context.executionMode !== "demo" || context.engine !== "demo_finance") {
    throw new Error("finance_demo_mode_required");
  }
}

async function findCustomerByCrm(
  context: Parameters<FinanceEngine["getStatus"]>[0],
  crmCustomerId: string,
) {
  const customers = await listDocuments(context.businessId,"customer");
  return customers.find((row) => row.crm_customer_id === crmCustomerId) ?? null;
}

async function updateInvoiceOutstanding(input: {
  businessId: string;
  invoice: DemoDocument;
  requestId: string;
  outstanding: string;
  status: "issued" | "partially_paid" | "paid";
}) {
  return withFinanceCapability(async (db) => {
    const result = await db.query<{ finance_demo_update_invoice: string }>(
      "select public.finance_demo_update_invoice($1,$2,$3,$4,$5)",
      [
        input.businessId,
        input.invoice.id,
        requestIdSchema.parse(input.requestId),
        decimalMoneySchema.parse(input.outstanding),
        input.status,
      ],
    );
    const id = result.rows[0]?.finance_demo_update_invoice;
    if (!id) throw new Error("finance_demo_write_failed");
    return id;
  });
}

function sameCurrency(rows: readonly { currency: string }[], fallback: string) {
  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size > 1) throw new Error("finance_mixed_currency_unsupported");
  return currencies.values().next().value ?? fallback;
}

export const demoFinanceEngine: FinanceEngine = {
  id: "demo_finance",
  capabilities: new Set([
    "health","customers","suppliers","quotations","invoices","payments",
    "bills","expenses","chart_of_accounts","ledger","trial_balance",
    "profit_and_loss","balance_sheet","cash_flow",
  ]),

  async getStatus(context) {
    assertDemo(context);
    return { ok: true, engine: "demo_finance", message: "Demo Finance ready." };
  },

  async listCustomers(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"customer")).map(financeCustomerFromDemo);
  },

  async resolveCustomer(context, crmCustomerId) {
    assertDemo(context);
    const row = await findCustomerByCrm(context,crmCustomerId);
    return row ? financeCustomerFromDemo(row) : null;
  },

  async createCustomer(context, input: CreateFinanceCustomerInput) {
    assertDemo(context);
    const existing = await findCustomerByCrm(context,input.crmCustomerId);
    if (existing) return financeCustomerFromDemo(existing);

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "customer",
      requestId: input.requestId,
      crmCustomerId: input.crmCustomerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      currency: context.defaultCurrency,
      status: "active",
    });
    const row = (await listDocuments(context.businessId,"customer"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_customer_unavailable");
    return financeCustomerFromDemo(row);
  },

  async listSuppliers(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"supplier")).map(financeSupplierFromDemo);
  },

  async createSupplier(context, input: CreateFinanceSupplierInput) {
    assertDemo(context);
    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "supplier",
      requestId: input.requestId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      currency: context.defaultCurrency,
      status: "active",
    });
    const row = (await listDocuments(context.businessId,"supplier"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_supplier_unavailable");
    return financeSupplierFromDemo(row);
  },

  async listQuotes(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"quote")).map(financeQuoteFromDemo);
  },

  async createQuote(context, input: CreateFinanceQuoteInput) {
    assertDemo(context);
    const customer = await findCustomerByCrm(context,input.crmCustomerId);
    if (!customer) throw new Error("finance_customer_mapping_required");

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "quote",
      requestId: input.requestId,
      crmCustomerId: input.crmCustomerId,
      linkedDocumentId: customer.id,
      status: "draft",
      currency: currencyCodeSchema.parse(input.currency),
      amount: input.amount,
      validUntil: input.validUntil,
    });
    const row = (await listDocuments(context.businessId,"quote"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_quote_unavailable");
    return financeQuoteFromDemo(row);
  },

  async listInvoices(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"invoice")).map(financeInvoiceFromDemo);
  },

  async createInvoice(context, input: CreateFinanceInvoiceInput) {
    assertDemo(context);
    const customer = await findCustomerByCrm(context,input.crmCustomerId);
    if (!customer) throw new Error("finance_customer_mapping_required");

    if (input.quoteId) {
      const quote = (await listDocuments(context.businessId,"quote"))
        .find((item) => item.id === input.quoteId);
      if (!quote || quote.crm_customer_id !== input.crmCustomerId) {
        throw new Error("finance_quote_unavailable");
      }
    }

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "invoice",
      requestId: input.requestId,
      crmCustomerId: input.crmCustomerId,
      linkedDocumentId: input.quoteId,
      status: "issued",
      currency: currencyCodeSchema.parse(input.currency),
      amount: input.amount,
      outstanding: input.amount,
      dueAt: input.dueAt,
    });
    const row = (await listDocuments(context.businessId,"invoice"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_invoice_unavailable");
    return financeInvoiceFromDemo(row);
  },

  async listPayments(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"payment")).map(financePaymentFromDemo);
  },

  async recordPayment(context, input: RecordFinancePaymentInput) {
    assertDemo(context);

    const existingPayment = (await listDocuments(context.businessId,"payment"))
      .find((item) => item.request_id === input.requestId);
    if (existingPayment) {
      return financePaymentFromDemo(existingPayment);
    }

    const invoices = await listDocuments(context.businessId,"invoice");
    const invoice = invoices.find((item) => item.id === input.invoiceId);
    if (!invoice) throw new Error("finance_invoice_unavailable");
    if (invoice.currency !== input.currency) throw new Error("finance_currency_mismatch");

    const paymentMinor = moneyToMinorUnits(input.amount);
    const outstandingMinor = moneyToMinorUnits(invoice.outstanding);
    if (paymentMinor <= BigInt(0) || paymentMinor > outstandingMinor) {
      throw new Error("finance_payment_amount_invalid");
    }

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "payment",
      requestId: input.requestId,
      linkedDocumentId: invoice.id,
      status: "posted",
      currency: input.currency,
      amount: input.amount,
    });

    const remaining = outstandingMinor - paymentMinor;
    await updateInvoiceOutstanding({
      businessId: context.businessId,
      invoice,
      requestId: input.requestId,
      outstanding: minorUnitsToMoney(remaining),
      status: remaining === BigInt(0) ? "paid" : "partially_paid",
    });

    const row = (await listDocuments(context.businessId,"payment"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_payment_unavailable");
    return financePaymentFromDemo(row);
  },

  async listBills(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"bill")).map(financeBillFromDemo);
  },

  async createBill(context, input: CreateFinanceBillInput) {
    assertDemo(context);
    const supplier = (await listDocuments(context.businessId,"supplier"))
      .find((item) => item.id === input.supplierId);
    if (!supplier) throw new Error("finance_supplier_unavailable");

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "bill",
      requestId: input.requestId,
      linkedDocumentId: supplier.id,
      status: "open",
      currency: input.currency,
      amount: input.amount,
      outstanding: input.amount,
      dueAt: input.dueAt,
    });
    const row = (await listDocuments(context.businessId,"bill"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_bill_unavailable");
    return financeBillFromDemo(row);
  },

  async listExpenses(context) {
    assertDemo(context);
    return (await listDocuments(context.businessId,"expense")).map(financeExpenseFromDemo);
  },

  async createExpense(context, input: CreateFinanceExpenseInput) {
    assertDemo(context);
    if (input.supplierId) {
      const supplier = (await listDocuments(context.businessId,"supplier"))
        .find((item) => item.id === input.supplierId);
      if (!supplier) throw new Error("finance_supplier_unavailable");
    }

    const id = await upsertDocument({
      businessId: context.businessId,
      documentType: "expense",
      requestId: input.requestId,
      linkedDocumentId: input.supplierId,
      category: input.category,
      status: "posted",
      currency: input.currency,
      amount: input.amount,
      incurredAt: input.incurredAt,
    });
    const row = (await listDocuments(context.businessId,"expense"))
      .find((item) => item.id === id);
    if (!row) throw new Error("finance_demo_expense_unavailable");
    return financeExpenseFromDemo(row);
  },

  async getDashboard(context): Promise<FinanceDashboard> {
    assertDemo(context);
    const invoices = await listDocuments(context.businessId,"invoice");
    const bills = await listDocuments(context.businessId,"bill");
    const expenses = await listDocuments(context.businessId,"expense");
    const currency = sameCurrency([...invoices,...bills,...expenses],context.defaultCurrency);
    const now = Date.now();

    return {
      currency,
      receivables: addMoney(invoices.map((row) => row.outstanding)),
      overdueReceivables: addMoney(invoices
        .filter((row) => row.due_at && Date.parse(row.due_at) < now && moneyToMinorUnits(row.outstanding) > BigInt(0))
        .map((row) => row.outstanding)),
      payables: addMoney(bills.map((row) => row.outstanding)),
      expenses: addMoney(expenses.map((row) => row.amount)),
      invoiceCount: invoices.length,
      paidInvoiceCount: invoices.filter((row) => row.status === "paid").length,
      unpaidInvoiceCount: invoices.filter((row) => row.status !== "paid" && row.status !== "void").length,
    };
  },

  async getChartOfAccounts(context): Promise<FinanceAccount[]> {
    assertDemo(context);
    return [
      { code: "1000", name: "Cash", type: "asset", currency: context.defaultCurrency },
      { code: "1100", name: "Accounts Receivable", type: "asset", currency: context.defaultCurrency },
      { code: "2000", name: "Accounts Payable", type: "liability", currency: context.defaultCurrency },
      { code: "4000", name: "Revenue", type: "income", currency: context.defaultCurrency },
      { code: "5000", name: "Operating Expenses", type: "expense", currency: context.defaultCurrency },
    ];
  },

  async getGeneralLedger(context): Promise<FinanceLedgerRow[]> {
    assertDemo(context);
    const invoices = await listDocuments(context.businessId,"invoice");
    const payments = await listDocuments(context.businessId,"payment");
    const bills = await listDocuments(context.businessId,"bill");
    const expenses = await listDocuments(context.businessId,"expense");
    const currency = sameCurrency([...invoices,...payments,...bills,...expenses],context.defaultCurrency);
    const rows: FinanceLedgerRow[] = [];

    for (const invoice of invoices) {
      rows.push({
        date: invoice.created_at, accountCode: "1100", accountName: "Accounts Receivable",
        debit: decimalMoneySchema.parse(invoice.amount), credit: "0.00", currency,
        reference: `invoice:${invoice.id}`,
      });
      rows.push({
        date: invoice.created_at, accountCode: "4000", accountName: "Revenue",
        debit: "0.00", credit: decimalMoneySchema.parse(invoice.amount), currency,
        reference: `invoice:${invoice.id}`,
      });
    }

    for (const payment of payments) {
      rows.push({
        date: payment.created_at, accountCode: "1000", accountName: "Cash",
        debit: decimalMoneySchema.parse(payment.amount), credit: "0.00", currency,
        reference: `payment:${payment.id}`,
      });
      rows.push({
        date: payment.created_at, accountCode: "1100", accountName: "Accounts Receivable",
        debit: "0.00", credit: decimalMoneySchema.parse(payment.amount), currency,
        reference: `payment:${payment.id}`,
      });
    }

    for (const bill of bills) {
      rows.push({
        date: bill.created_at, accountCode: "5000", accountName: "Operating Expenses",
        debit: decimalMoneySchema.parse(bill.amount), credit: "0.00", currency,
        reference: `bill:${bill.id}`,
      });
      rows.push({
        date: bill.created_at, accountCode: "2000", accountName: "Accounts Payable",
        debit: "0.00", credit: decimalMoneySchema.parse(bill.amount), currency,
        reference: `bill:${bill.id}`,
      });
    }

    for (const expense of expenses) {
      rows.push({
        date: expense.created_at, accountCode: "5000", accountName: "Operating Expenses",
        debit: decimalMoneySchema.parse(expense.amount), credit: "0.00", currency,
        reference: `expense:${expense.id}`,
      });
      rows.push({
        date: expense.created_at, accountCode: "1000", accountName: "Cash",
        debit: "0.00", credit: decimalMoneySchema.parse(expense.amount), currency,
        reference: `expense:${expense.id}`,
      });
    }

    return rows.sort((a,b) => a.date.localeCompare(b.date));
  },

  async getTrialBalance(context): Promise<FinanceTrialBalanceRow[]> {
    const ledger = await this.getGeneralLedger!(context);
    const byAccount = new Map<string, { name: string; debit: bigint; credit: bigint; currency: string }>();
    for (const row of ledger) {
      const item = byAccount.get(row.accountCode) ?? {
        name: row.accountName,debit: BigInt(0),credit: BigInt(0),currency: row.currency,
      };
      item.debit += moneyToMinorUnits(row.debit);
      item.credit += moneyToMinorUnits(row.credit);
      byAccount.set(row.accountCode,item);
    }
    return [...byAccount.entries()].map(([accountCode,row]) => ({
      accountCode, accountName: row.name,
      debit: minorUnitsToMoney(row.debit),
      credit: minorUnitsToMoney(row.credit),
      currency: row.currency,
    }));
  },

  async getProfitAndLoss(context): Promise<FinanceReport> {
    assertDemo(context);
    const invoices = await listDocuments(context.businessId,"invoice");
    const bills = await listDocuments(context.businessId,"bill");
    const expenses = await listDocuments(context.businessId,"expense");
    const currency = sameCurrency([...invoices,...bills,...expenses],context.defaultCurrency);
    const revenue = invoices.reduce((sum,row) => sum + moneyToMinorUnits(row.amount),BigInt(0));
    const costs = [...bills,...expenses]
      .reduce((sum,row) => sum + moneyToMinorUnits(row.amount),BigInt(0));
    const profit = revenue - costs;
    return {
      asOf: new Date().toISOString(), currency,
      lines: [
        { key: "revenue", label: "Revenue", amount: minorUnitsToMoney(revenue), currency },
        { key: "expenses", label: "Expenses", amount: minorUnitsToMoney(costs), currency },
      ],
      total: minorUnitsToMoney(profit),
    };
  },

  async getBalanceSheet(context): Promise<FinanceReport> {
    assertDemo(context);
    const invoices = await listDocuments(context.businessId,"invoice");
    const payments = await listDocuments(context.businessId,"payment");
    const bills = await listDocuments(context.businessId,"bill");
    const expenses = await listDocuments(context.businessId,"expense");
    const currency = sameCurrency([...invoices,...payments,...bills,...expenses],context.defaultCurrency);
    const cash = payments.reduce((s,r)=>s+moneyToMinorUnits(r.amount),BigInt(0))
      - expenses.reduce((s,r)=>s+moneyToMinorUnits(r.amount),BigInt(0));
    const receivables = invoices.reduce((s,r)=>s+moneyToMinorUnits(r.outstanding),BigInt(0));
    const payables = bills.reduce((s,r)=>s+moneyToMinorUnits(r.outstanding),BigInt(0));
    const equity = cash + receivables - payables;
    return {
      asOf: new Date().toISOString(),currency,
      lines: [
        { key:"cash",label:"Cash",amount:minorUnitsToMoney(cash),currency },
        { key:"receivables",label:"Accounts Receivable",amount:minorUnitsToMoney(receivables),currency },
        { key:"payables",label:"Accounts Payable",amount:minorUnitsToMoney(payables),currency },
      ],
      total: minorUnitsToMoney(equity),
    };
  },

  async getCashFlow(context): Promise<FinanceReport> {
    assertDemo(context);
    const payments = await listDocuments(context.businessId,"payment");
    const expenses = await listDocuments(context.businessId,"expense");
    const currency = sameCurrency([...payments,...expenses],context.defaultCurrency);
    const inflow = payments.reduce((s,r)=>s+moneyToMinorUnits(r.amount),BigInt(0));
    const outflow = expenses.reduce((s,r)=>s+moneyToMinorUnits(r.amount),BigInt(0));
    return {
      asOf:new Date().toISOString(),currency,
      lines:[
        { key:"customer_receipts",label:"Customer receipts",amount:minorUnitsToMoney(inflow),currency },
        { key:"operating_payments",label:"Operating payments",amount:minorUnitsToMoney(-outflow),currency },
      ],
      total:minorUnitsToMoney(inflow-outflow),
    };
  },
};

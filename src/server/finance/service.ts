import "server-only";

import { z } from "zod";
import {
  currencyCodeSchema,
  decimalMoneySchema,
  type FinanceExecutionContext,
} from "./domain";
import {
  type CreateFinanceBillInput,
  type CreateFinanceCustomerInput,
  type CreateFinanceExpenseInput,
  type CreateFinanceInvoiceInput,
  type CreateFinanceQuoteInput,
  type CreateFinanceSupplierInput,
  type FinanceEngine,
  type RecordFinancePaymentInput,
  requireFinanceCapability,
} from "./engine";
import { loadFinanceContext, type LoadedFinanceContext } from "./context";
import { getFinanceEngine } from "./registry";
import {
  completeFinanceExecution,
  prepareFinanceExecution,
  requireFinanceExternalEffectAllowed,
} from "./execution";
import { withFinanceCapability } from "./capability";

const trustedCustomerSchema = z.object({
  customer_id: z.string().uuid(),
  contact_name: z.string(),
  email: z.string(),
  phone: z.string(),
});

function safeFinanceErrorCode(error: unknown) {
  if (error instanceof Error && /^finance_[a-z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
    && /^erpnext_[a-z0-9_]+$/.test((error as { code: string }).code)
  ) {
    return (error as { code: string }).code;
  }
  return "finance_provider_request_failed";
}

async function financeSession(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const context = await loadFinanceContext(input);
  const engine = getFinanceEngine({
    engine: context.engine,
    credentialKey: context.credentialKey,
  });
  return { context,engine };
}

async function trustedCustomer(
  context: LoadedFinanceContext,
  crmCustomerId: string,
) {
  const raw = await withFinanceCapability(async (db) => {
    const result = await db.query(
      "select * from public.finance_customer_for_business($1,$2)",
      [context.businessId,crmCustomerId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = trustedCustomerSchema.safeParse(raw);
  if (!parsed.success) throw new Error("finance_crm_customer_unavailable");
  return parsed.data;
}

async function mapCustomer(
  context: LoadedFinanceContext,
  crmCustomerId: string,
  externalRef: string,
) {
  if (!context.connectionId) throw new Error("finance_connection_unavailable");
  await withFinanceCapability(async (db) => {
    await db.query(
      "select public.finance_upsert_customer_mapping($1,$2,$3,$4,$5)",
      [
        context.businessId,
        context.connectionId,
        crmCustomerId,
        context.engine,
        externalRef,
      ],
    );
  });
}

async function executeWrite<T>(input: {
  context: LoadedFinanceContext;
  engine: FinanceEngine;
  operation: string;
  documentType: string;
  codeedgeReference: string;
  requestId: string;
  perform: () => Promise<T>;
  externalReference: (result: T) => string | null;
}) {
  const prepared = await prepareFinanceExecution({
    businessId: input.context.businessId,
    userId: input.context.userId,
    operation: input.operation,
    documentType: input.documentType,
    codeedgeReference: input.codeedgeReference,
    correlationId: input.context.correlationId,
    requestId: z.string().uuid().parse(input.requestId),
  });

  if (!prepared.created) {
    if (prepared.status === "failed") {
      throw new Error("finance_previous_attempt_failed");
    }
    if (prepared.status === "ambiguous" || prepared.status === "prepared") {
      throw new Error("finance_execution_in_flight");
    }
    throw new Error("finance_execution_already_completed");
  }

  if (input.context.engine !== "demo_finance") {
    try {
      await requireFinanceExternalEffectAllowed(
        prepared.execution_id,
        input.context.engine,
      );
    } catch (error) {
      await completeFinanceExecution({
        executionId: prepared.execution_id,
        status: "failed",
        errorCode: safeFinanceErrorCode(error),
      }).catch(() => undefined);
      throw error;
    }
  }

  let result: T;
  try {
    result = await input.perform();
  } catch (error) {
    await completeFinanceExecution({
      executionId: prepared.execution_id,
      status: "failed",
      errorCode: safeFinanceErrorCode(error),
    }).catch(() => undefined);
    throw new Error(safeFinanceErrorCode(error));
  }

  const status = input.context.engine === "demo_finance"
    ? "simulated" as const
    : "succeeded" as const;

  try {
    await completeFinanceExecution({
      executionId: prepared.execution_id,
      status,
      externalReference: input.externalReference(result) ?? "",
    });
  } catch {
    // A real provider may already have accepted the write. Do not auto-retry.
    if (input.context.engine !== "demo_finance") {
      throw new Error("finance_provider_success_persist_ambiguous");
    }
    throw new Error("finance_demo_persist_failed");
  }

  return result;
}

export async function getFinanceStatus(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"health");
  return engine.getStatus(context);
}

export async function listFinanceCustomers(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"customers");
  if (!engine.listCustomers) throw new Error("finance_capability_unavailable");
  return engine.listCustomers(context);
}

export async function ensureFinanceCustomer(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  crmCustomerId: string;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"customers");
  if (!engine.resolveCustomer || !engine.createCustomer) {
    throw new Error("finance_capability_unavailable");
  }

  const customer = await trustedCustomer(context,input.crmCustomerId);
  const existing = await engine.resolveCustomer(context,customer.customer_id);
  if (existing) {
    if (existing.externalRef) {
      await mapCustomer(context,customer.customer_id,existing.externalRef);
    }
    return existing;
  }

  const createInput: CreateFinanceCustomerInput = {
    crmCustomerId: customer.customer_id,
    name: customer.contact_name,
    email: customer.email,
    phone: customer.phone,
    requestId: input.requestId,
  };

  const created = await executeWrite({
    context,
    engine,
    operation: "finance.customer.create",
    documentType: "customer",
    codeedgeReference: customer.customer_id,
    requestId: input.requestId,
    perform: () => engine.createCustomer!(context,createInput),
    externalReference: (result) => result.externalRef,
  });

  if (created.externalRef) {
    await mapCustomer(context,customer.customer_id,created.externalRef);
  }
  return created;
}

export async function createFinanceQuote(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  crmCustomerId: string;
  currency: string;
  amount: string;
  validUntil: string | null;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"quotations");
  if (!engine.createQuote) throw new Error("finance_capability_unavailable");

  await trustedCustomer(context,input.crmCustomerId);
  const payload: CreateFinanceQuoteInput = {
    crmCustomerId: input.crmCustomerId,
    currency: currencyCodeSchema.parse(input.currency),
    amount: decimalMoneySchema.parse(input.amount),
    validUntil: input.validUntil,
    requestId: input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.quote.create",
    documentType:"quote",
    codeedgeReference:input.crmCustomerId,
    requestId:input.requestId,
    perform:()=>engine.createQuote!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function createFinanceInvoice(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  crmCustomerId: string;
  quoteId: string | null;
  currency: string;
  amount: string;
  dueAt: string | null;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"invoices");
  if (!engine.createInvoice) throw new Error("finance_capability_unavailable");

  await trustedCustomer(context,input.crmCustomerId);
  const payload: CreateFinanceInvoiceInput = {
    quoteId: input.quoteId,
    crmCustomerId: input.crmCustomerId,
    currency: currencyCodeSchema.parse(input.currency),
    amount: decimalMoneySchema.parse(input.amount),
    dueAt: input.dueAt,
    requestId: input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.invoice.create",
    documentType:"invoice",
    codeedgeReference:input.crmCustomerId,
    requestId:input.requestId,
    perform:()=>engine.createInvoice!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function recordFinancePayment(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  invoiceId: string;
  currency: string;
  amount: string;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"payments");
  if (!engine.recordPayment) throw new Error("finance_capability_unavailable");

  const payload: RecordFinancePaymentInput = {
    invoiceId: z.string().min(1).max(255).parse(input.invoiceId),
    currency: currencyCodeSchema.parse(input.currency),
    amount: decimalMoneySchema.parse(input.amount),
    requestId: input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.payment.record",
    documentType:"payment",
    codeedgeReference:input.invoiceId,
    requestId:input.requestId,
    perform:()=>engine.recordPayment!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function createFinanceSupplier(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  name: string;
  email: string;
  phone: string;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"suppliers");
  if (!engine.createSupplier) throw new Error("finance_capability_unavailable");

  const payload: CreateFinanceSupplierInput = {
    name:z.string().trim().min(1).max(200).parse(input.name),
    email:z.string().trim().max(320).parse(input.email),
    phone:z.string().trim().max(80).parse(input.phone),
    requestId:input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.supplier.create",
    documentType:"supplier",
    codeedgeReference:"",
    requestId:input.requestId,
    perform:()=>engine.createSupplier!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function createFinanceBill(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  supplierId: string;
  currency: string;
  amount: string;
  dueAt: string | null;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"bills");
  if (!engine.createBill) throw new Error("finance_capability_unavailable");

  const payload: CreateFinanceBillInput = {
    supplierId:z.string().min(1).max(255).parse(input.supplierId),
    currency:currencyCodeSchema.parse(input.currency),
    amount:decimalMoneySchema.parse(input.amount),
    dueAt:input.dueAt,
    requestId:input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.bill.create",
    documentType:"bill",
    codeedgeReference:input.supplierId,
    requestId:input.requestId,
    perform:()=>engine.createBill!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function createFinanceExpense(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  supplierId: string | null;
  category: string;
  currency: string;
  amount: string;
  incurredAt: string;
  requestId: string;
}) {
  const { context,engine } = await financeSession(input);
  requireFinanceCapability(engine,"expenses");
  if (!engine.createExpense) throw new Error("finance_capability_unavailable");

  const payload: CreateFinanceExpenseInput = {
    supplierId:input.supplierId,
    category:z.string().trim().min(1).max(120).parse(input.category),
    currency:currencyCodeSchema.parse(input.currency),
    amount:decimalMoneySchema.parse(input.amount),
    incurredAt:z.string().datetime({offset:true}).parse(input.incurredAt),
    requestId:input.requestId,
  };

  return executeWrite({
    context,engine,
    operation:"finance.expense.create",
    documentType:"expense",
    codeedgeReference:input.supplierId ?? "",
    requestId:input.requestId,
    perform:()=>engine.createExpense!(context,payload),
    externalReference:(result)=>result.externalRef,
  });
}

export async function getMoneyOverview(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const { context,engine } = await financeSession(input);
  if (!engine.getDashboard) throw new Error("finance_capability_unavailable");
  return engine.getDashboard(context);
}

export async function getFinanceAccountingViews(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const { context,engine } = await financeSession(input);
  return {
    accounts: engine.getChartOfAccounts
      ? await engine.getChartOfAccounts(context) : null,
    ledger: engine.getGeneralLedger
      ? await engine.getGeneralLedger(context) : null,
    trialBalance: engine.getTrialBalance
      ? await engine.getTrialBalance(context) : null,
  };
}

export async function getFinanceReports(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}) {
  const { context,engine } = await financeSession(input);
  return {
    profitAndLoss: engine.getProfitAndLoss
      ? await engine.getProfitAndLoss(context) : null,
    balanceSheet: engine.getBalanceSheet
      ? await engine.getBalanceSheet(context) : null,
    cashFlow: engine.getCashFlow
      ? await engine.getCashFlow(context) : null,
  };
}

import type {
  FinanceAccount,
  FinanceBill,
  FinanceCapability,
  FinanceCustomer,
  FinanceDashboard,
  FinanceExecutionContext,
  FinanceExpense,
  FinanceInvoice,
  FinanceLedgerRow,
  FinancePayment,
  FinanceQuote,
  FinanceReport,
  FinanceSupplier,
  FinanceTrialBalanceRow,
} from "./domain";

export type FinanceEngineStatus = {
  ok: boolean;
  engine: string;
  message: string;
};

export type CreateFinanceCustomerInput = {
  crmCustomerId: string;
  name: string;
  email: string;
  phone: string;
  requestId: string;
};

export type CreateFinanceQuoteInput = {
  crmCustomerId: string;
  currency: string;
  amount: string;
  validUntil: string | null;
  requestId: string;
};

export type CreateFinanceInvoiceInput = {
  quoteId: string | null;
  crmCustomerId: string;
  currency: string;
  amount: string;
  dueAt: string | null;
  requestId: string;
};

export type RecordFinancePaymentInput = {
  invoiceId: string;
  currency: string;
  amount: string;
  requestId: string;
};

export type CreateFinanceSupplierInput = {
  name: string;
  email: string;
  phone: string;
  requestId: string;
};

export type CreateFinanceBillInput = {
  supplierId: string;
  currency: string;
  amount: string;
  dueAt: string | null;
  requestId: string;
};

export type CreateFinanceExpenseInput = {
  supplierId: string | null;
  category: string;
  currency: string;
  amount: string;
  incurredAt: string;
  requestId: string;
};

export interface FinanceEngine {
  readonly id: string;
  readonly capabilities: ReadonlySet<FinanceCapability>;
  readonly writeCapabilities: ReadonlySet<FinanceCapability>;

  getStatus(context: FinanceExecutionContext): Promise<FinanceEngineStatus>;

  listCustomers?(context: FinanceExecutionContext): Promise<FinanceCustomer[]>;
  resolveCustomer?(
    context: FinanceExecutionContext,
    crmCustomerId: string,
  ): Promise<FinanceCustomer | null>;
  createCustomer?(
    context: FinanceExecutionContext,
    input: CreateFinanceCustomerInput,
  ): Promise<FinanceCustomer>;

  listSuppliers?(context: FinanceExecutionContext): Promise<FinanceSupplier[]>;
  createSupplier?(
    context: FinanceExecutionContext,
    input: CreateFinanceSupplierInput,
  ): Promise<FinanceSupplier>;

  listQuotes?(context: FinanceExecutionContext): Promise<FinanceQuote[]>;
  createQuote?(
    context: FinanceExecutionContext,
    input: CreateFinanceQuoteInput,
  ): Promise<FinanceQuote>;

  listInvoices?(context: FinanceExecutionContext): Promise<FinanceInvoice[]>;
  createInvoice?(
    context: FinanceExecutionContext,
    input: CreateFinanceInvoiceInput,
  ): Promise<FinanceInvoice>;

  listPayments?(context: FinanceExecutionContext): Promise<FinancePayment[]>;
  recordPayment?(
    context: FinanceExecutionContext,
    input: RecordFinancePaymentInput,
  ): Promise<FinancePayment>;

  listBills?(context: FinanceExecutionContext): Promise<FinanceBill[]>;
  createBill?(
    context: FinanceExecutionContext,
    input: CreateFinanceBillInput,
  ): Promise<FinanceBill>;

  listExpenses?(context: FinanceExecutionContext): Promise<FinanceExpense[]>;
  createExpense?(
    context: FinanceExecutionContext,
    input: CreateFinanceExpenseInput,
  ): Promise<FinanceExpense>;

  getDashboard?(context: FinanceExecutionContext): Promise<FinanceDashboard>;
  getChartOfAccounts?(context: FinanceExecutionContext): Promise<FinanceAccount[]>;
  getGeneralLedger?(context: FinanceExecutionContext): Promise<FinanceLedgerRow[]>;
  getTrialBalance?(context: FinanceExecutionContext): Promise<FinanceTrialBalanceRow[]>;
  getProfitAndLoss?(context: FinanceExecutionContext): Promise<FinanceReport>;
  getBalanceSheet?(context: FinanceExecutionContext): Promise<FinanceReport>;
  getCashFlow?(context: FinanceExecutionContext): Promise<FinanceReport>;
}

export class FinanceCapabilityError extends Error {
  constructor(
    public readonly engineId: string,
    public readonly capability: FinanceCapability,
  ) {
    super(`Finance engine ${engineId} does not support ${capability}.`);
    this.name = "FinanceCapabilityError";
  }
}

export function requireFinanceCapability(
  engine: FinanceEngine,
  capability: FinanceCapability,
) {
  if (!engine.capabilities.has(capability)) {
    throw new FinanceCapabilityError(engine.id, capability);
  }
  return engine;
}

export function requireFinanceWriteCapability(
  engine: FinanceEngine,
  capability: FinanceCapability,
) {
  if (!engine.writeCapabilities.has(capability)) {
    throw new FinanceCapabilityError(engine.id, capability);
  }
  return engine;
}

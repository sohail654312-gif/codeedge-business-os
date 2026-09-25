import { z } from "zod";

export const financeEngineIds = ["demo_finance", "erpnext"] as const;
export type FinanceEngineId = (typeof financeEngineIds)[number];

export const financeCapabilities = [
  "health",
  "customers",
  "suppliers",
  "quotations",
  "invoices",
  "payments",
  "bills",
  "expenses",
  "chart_of_accounts",
  "ledger",
  "trial_balance",
  "profit_and_loss",
  "balance_sheet",
  "cash_flow",
] as const;
export type FinanceCapability = (typeof financeCapabilities)[number];

export const financeQuoteStatuses = [
  "draft","sent","accepted","rejected","expired","cancelled",
] as const;
export type FinanceQuoteStatus = (typeof financeQuoteStatuses)[number];

export const financeInvoiceStatuses = [
  "draft","issued","partially_paid","paid","overdue","void",
] as const;
export type FinanceInvoiceStatus = (typeof financeInvoiceStatuses)[number];

export const financePaymentStatuses = [
  "pending","posted","failed","reversed",
] as const;
export type FinancePaymentStatus = (typeof financePaymentStatuses)[number];

export const financeBillStatuses = [
  "draft","open","partially_paid","paid","overdue","void",
] as const;
export type FinanceBillStatus = (typeof financeBillStatuses)[number];

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const decimalMoneySchema = z.string()
  .regex(/^-?(0|[1-9]\d{0,14})(\.\d{1,2})?$/)
  .refine((value) => {
    const normalized = value.startsWith("-") ? value.slice(1) : value;
    const [whole] = normalized.split(".");
    return whole.length <= 15;
  }, "Money amount is too large.");

export type DecimalMoney = z.infer<typeof decimalMoneySchema>;

export function moneyToMinorUnits(value: string): bigint {
  const parsed = decimalMoneySchema.parse(value);
  const negative = parsed.startsWith("-");
  const unsigned = negative ? parsed.slice(1) : parsed;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -minor : minor;
}

export function minorUnitsToMoney(value: bigint): DecimalMoney {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return decimalMoneySchema.parse(`${negative ? "-" : ""}${whole}.${fraction}`);
}

export function addMoney(values: readonly string[]): DecimalMoney {
  return minorUnitsToMoney(values.reduce((sum, value) => sum + moneyToMinorUnits(value), 0n));
}

export type FinanceAmount = {
  amount: DecimalMoney;
  currency: string;
};

export type FinanceCustomer = {
  id: string;
  crmCustomerId: string | null;
  name: string;
  email: string;
  phone: string;
  externalRef: string | null;
};

export type FinanceSupplier = {
  id: string;
  name: string;
  email: string;
  phone: string;
  externalRef: string | null;
};

export type FinanceQuote = {
  id: string;
  customerId: string;
  status: FinanceQuoteStatus;
  currency: string;
  total: DecimalMoney;
  externalRef: string | null;
  createdAt: string;
  validUntil: string | null;
};

export type FinanceInvoice = {
  id: string;
  customerId: string;
  status: FinanceInvoiceStatus;
  currency: string;
  total: DecimalMoney;
  outstanding: DecimalMoney;
  externalRef: string | null;
  issuedAt: string | null;
  dueAt: string | null;
};

export type FinancePayment = {
  id: string;
  invoiceId: string;
  status: FinancePaymentStatus;
  currency: string;
  amount: DecimalMoney;
  externalRef: string | null;
  recordedAt: string;
};

export type FinanceBill = {
  id: string;
  supplierId: string;
  status: FinanceBillStatus;
  currency: string;
  total: DecimalMoney;
  outstanding: DecimalMoney;
  externalRef: string | null;
  dueAt: string | null;
};

export type FinanceExpense = {
  id: string;
  supplierId: string | null;
  category: string;
  currency: string;
  amount: DecimalMoney;
  externalRef: string | null;
  incurredAt: string;
};

export type FinanceAccount = {
  code: string;
  name: string;
  type: string;
  currency: string | null;
};

export type FinanceLedgerRow = {
  date: string;
  accountCode: string;
  accountName: string;
  debit: DecimalMoney;
  credit: DecimalMoney;
  currency: string;
  reference: string;
};

export type FinanceTrialBalanceRow = {
  accountCode: string;
  accountName: string;
  debit: DecimalMoney;
  credit: DecimalMoney;
  currency: string;
};

export type FinanceReportLine = {
  key: string;
  label: string;
  amount: DecimalMoney;
  currency: string;
};

export type FinanceReport = {
  asOf: string;
  currency: string;
  lines: FinanceReportLine[];
  total: DecimalMoney;
};

export type FinanceDashboard = {
  currency: string;
  receivables: DecimalMoney;
  overdueReceivables: DecimalMoney;
  payables: DecimalMoney;
  expenses: DecimalMoney;
  invoiceCount: number;
  paidInvoiceCount: number;
  unpaidInvoiceCount: number;
};

export type FinanceExecutionContext = {
  businessId: string;
  userId: string;
  executionMode: "demo" | "sandbox" | "production";
  engine: FinanceEngineId;
  connectionId: string | null;
  credentialEnvironment: "sandbox" | "production" | null;
  correlationId: string;
};

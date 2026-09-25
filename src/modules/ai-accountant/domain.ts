import { z } from "zod";
import {
  currencyCodeSchema,
  decimalMoneySchema,
  moneyToMinorUnits,
} from "@/server/finance/domain";

const uuidSchema = z.string().uuid();
const idSchema = z.string().trim().min(1).max(255);
const instantSchema = z.string().datetime({ offset:true });
const positiveMoneySchema = decimalMoneySchema.refine(
  (value) => moneyToMinorUnits(value) > BigInt(0),
  "Amount must be greater than zero.",
);

export const aiAccountantPromptVersion = "accountant-v1";

export const aiAccountantToolNames = [
  "finance_status",
  "money_dashboard",
  "list_customers",
  "list_suppliers",
  "list_quotes",
  "list_invoices",
  "list_payments",
  "list_bills",
  "list_expenses",
  "chart_of_accounts",
  "general_ledger",
  "trial_balance",
  "profit_and_loss",
  "balance_sheet",
  "cash_flow",
  "propose_customer_creation",
  "propose_quote",
  "propose_invoice",
  "propose_supplier",
  "propose_bill",
  "propose_expense",
  "propose_payment_record",
] as const;

export type AIAccountantToolName = (typeof aiAccountantToolNames)[number];
export type AIToolRiskClass = "read" | "proposal";

export const customerProposalSchema = z.object({
  crmCustomerId: uuidSchema,
}).strict();

export const quoteProposalSchema = z.object({
  crmCustomerId: uuidSchema,
  currency: currencyCodeSchema,
  amount: positiveMoneySchema,
  validUntil: instantSchema.nullable(),
}).strict();

export const invoiceProposalSchema = z.object({
  quoteId: idSchema.nullable().optional().default(null),
  crmCustomerId: uuidSchema,
  currency: currencyCodeSchema,
  amount: positiveMoneySchema,
  dueAt: instantSchema.nullable(),
}).strict();

export const supplierProposalSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320),
  phone: z.string().trim().max(80),
}).strict();

export const billProposalSchema = z.object({
  supplierId: idSchema,
  currency: currencyCodeSchema,
  amount: positiveMoneySchema,
  dueAt: instantSchema.nullable(),
}).strict();

export const expenseProposalSchema = z.object({
  supplierId: idSchema.nullable(),
  category: z.string().trim().min(1).max(120),
  currency: currencyCodeSchema,
  amount: positiveMoneySchema,
  incurredAt: instantSchema,
}).strict();

export const paymentProposalSchema = z.object({
  invoiceId: idSchema,
  currency: currencyCodeSchema,
  amount: positiveMoneySchema,
}).strict();

export const financeProposalSchemas = {
  "finance.customer.create":customerProposalSchema,
  "finance.quote.create":quoteProposalSchema,
  "finance.invoice.create":invoiceProposalSchema,
  "finance.supplier.create":supplierProposalSchema,
  "finance.bill.create":billProposalSchema,
  "finance.expense.create":expenseProposalSchema,
  "finance.payment.record":paymentProposalSchema,
} as const;

export type FinanceAIActionType = keyof typeof financeProposalSchemas;

export const financeAIActionLabels: Record<FinanceAIActionType,string> = {
  "finance.customer.create":"Create Finance Customer",
  "finance.quote.create":"Create Quote",
  "finance.invoice.create":"Create Invoice",
  "finance.supplier.create":"Create Supplier",
  "finance.bill.create":"Create Bill",
  "finance.expense.create":"Create Expense",
  "finance.payment.record":"Record Accounting Payment",
};

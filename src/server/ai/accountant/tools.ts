import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AIToolDefinition } from "@/server/ai/provider";
import {
  financeAIActionLabels,
  financeProposalSchemas,
  type AIAccountantToolName,
  type AIToolRiskClass,
  type FinanceAIActionType,
} from "@/modules/ai-accountant/domain";
import {
  getFinanceBalanceSheet,
  getFinanceCashFlow,
  getFinanceChartOfAccounts,
  getFinanceCrmCustomer,
  getFinanceGeneralLedger,
  getFinanceProfitAndLoss,
  getFinanceStatus,
  getFinanceTrialBalance,
  getMoneyOverview,
  listFinanceBills,
  listFinanceCustomers,
  listFinanceExpenses,
  listFinanceInvoices,
  listFinancePayments,
  listFinanceQuotes,
  listFinanceSuppliers,
} from "@/server/finance/service";
import { createAIActionProposal } from "@/server/ai/persistence";
import { sha256Json } from "@/server/ai/integrity";
import type { AIAccountantTrustedContext } from "./context";

export type AIAccountantToolContext = AIAccountantTrustedContext & {
  sessionId: string;
};

const sourceSchema = z.object({
  tool:z.string(),
  documentType:z.string(),
  asOf:z.string(),
  currency:z.string().nullable(),
  documentIds:z.array(z.string()).max(100),
}).strict();

const readResultSchema = z.object({
  source:sourceSchema,
  data:z.unknown(),
}).strict();

const proposalResultSchema = z.object({
  source:sourceSchema,
  proposal:z.object({
    id:z.string().uuid(),
    actionType:z.string(),
    summary:z.string(),
    payloadHash:z.string().regex(/^[0-9a-f]{64}$/),
    expiresAt:z.string(),
  }).strict(),
}).strict();

type ToolDefinition = {
  name: AIAccountantToolName;
  description: string;
  risk: AIToolRiskClass;
  requiresHumanApproval: boolean;
  inputSchema: z.ZodTypeAny;
  resultSchema: z.ZodTypeAny;
  providerDefinition: AIToolDefinition;
  execute: (context: AIAccountantToolContext,input: unknown) => Promise<unknown>;
};

const emptySchema = z.object({}).strict();
const emptyJson = { type:"object",properties:{},additionalProperties:false };

function readSource(
  tool: string,
  documentType: string,
  currency: string | null,
  documentIds: string[] = [],
  asOf = new Date().toISOString(),
) {
  return { tool,documentType,currency,documentIds:documentIds.slice(0,100),asOf };
}

function readTool(input: {
  name: AIAccountantToolName;
  description: string;
  documentType: string;
  run: (context: AIAccountantToolContext) => Promise<{
    data: unknown;
    currency?: string | null;
    documentIds?: string[];
    asOf?: string;
  }>;
}): ToolDefinition {
  return {
    name:input.name,
    description:input.description,
    risk:"read",
    requiresHumanApproval:false,
    inputSchema:emptySchema,
    resultSchema:readResultSchema,
    providerDefinition:{
      name:input.name,
      description:input.description,
      inputJsonSchema:emptyJson,
    },
    async execute(context) {
      const result = await input.run(context);
      return {
        source:readSource(
          input.name,input.documentType,result.currency ?? context.defaultCurrency,
          result.documentIds ?? [],result.asOf,
        ),
        data:result.data,
      };
    },
  };
}

function proposalJsonSchema(action: FinanceAIActionType): Record<string,unknown> {
  switch (action) {
    case "finance.customer.create":
      return {
        type:"object",
        properties:{ crmCustomerId:{ type:"string",format:"uuid" } },
        required:["crmCustomerId"],
        additionalProperties:false,
      };
    case "finance.quote.create":
      return {
        type:"object",
        properties:{
          crmCustomerId:{ type:"string",format:"uuid" },
          currency:{ type:"string",pattern:"^[A-Z]{3}$" },
          amount:{ type:"string",pattern:"^-?(0|[1-9]\\d{0,14})(\\.\\d{1,2})?$" },
          validUntil:{ anyOf:[{ type:"string",format:"date-time" },{ type:"null" }] },
        },
        required:["crmCustomerId","currency","amount","validUntil"],
        additionalProperties:false,
      };
    case "finance.invoice.create":
      return {
        type:"object",
        properties:{
          quoteId:{ anyOf:[{ type:"string",minLength:1,maxLength:255 },{ type:"null" }] },
          crmCustomerId:{ type:"string",format:"uuid" },
          currency:{ type:"string",pattern:"^[A-Z]{3}$" },
          amount:{ type:"string",pattern:"^-?(0|[1-9]\\d{0,14})(\\.\\d{1,2})?$" },
          dueAt:{ anyOf:[{ type:"string",format:"date-time" },{ type:"null" }] },
        },
        required:["crmCustomerId","currency","amount","dueAt"],
        additionalProperties:false,
      };
    case "finance.supplier.create":
      return {
        type:"object",
        properties:{
          name:{ type:"string",minLength:1,maxLength:200 },
          email:{ type:"string",maxLength:320 },
          phone:{ type:"string",maxLength:80 },
        },
        required:["name","email","phone"],
        additionalProperties:false,
      };
    case "finance.bill.create":
      return {
        type:"object",
        properties:{
          supplierId:{ type:"string",minLength:1,maxLength:255 },
          currency:{ type:"string",pattern:"^[A-Z]{3}$" },
          amount:{ type:"string",pattern:"^-?(0|[1-9]\\d{0,14})(\\.\\d{1,2})?$" },
          dueAt:{ anyOf:[{ type:"string",format:"date-time" },{ type:"null" }] },
        },
        required:["supplierId","currency","amount","dueAt"],
        additionalProperties:false,
      };
    case "finance.expense.create":
      return {
        type:"object",
        properties:{
          supplierId:{ anyOf:[{ type:"string",minLength:1,maxLength:255 },{ type:"null" }] },
          category:{ type:"string",minLength:1,maxLength:120 },
          currency:{ type:"string",pattern:"^[A-Z]{3}$" },
          amount:{ type:"string",pattern:"^-?(0|[1-9]\\d{0,14})(\\.\\d{1,2})?$" },
          incurredAt:{ type:"string",format:"date-time" },
        },
        required:["supplierId","category","currency","amount","incurredAt"],
        additionalProperties:false,
      };
    case "finance.payment.record":
      return {
        type:"object",
        properties:{
          invoiceId:{ type:"string",minLength:1,maxLength:255 },
          currency:{ type:"string",pattern:"^[A-Z]{3}$" },
          amount:{ type:"string",pattern:"^-?(0|[1-9]\\d{0,14})(\\.\\d{1,2})?$" },
        },
        required:["invoiceId","currency","amount"],
        additionalProperties:false,
      };
  }
}

async function validateProposalTargets(
  context: AIAccountantToolContext,
  action: FinanceAIActionType,
  payload: Record<string,unknown>,
) {
  const financeInput = {
    businessId:context.businessId,
    userId:context.userId,
    correlationId:context.correlationId,
  };

  if (
    action === "finance.customer.create"
    || action === "finance.quote.create"
    || action === "finance.invoice.create"
  ) {
    await getFinanceCrmCustomer({
      ...financeInput,
      crmCustomerId:String(payload.crmCustomerId),
    });
  }

  if (action === "finance.invoice.create" && payload.quoteId) {
    const quotes = await listFinanceQuotes(financeInput);
    if (!quotes.some((item) => item.id === payload.quoteId)) {
      throw new Error("ai_finance_target_unavailable");
    }
  }

  if (action === "finance.payment.record") {
    const invoices = await listFinanceInvoices(financeInput);
    const invoice = invoices.find((item) => item.id === payload.invoiceId);
    if (!invoice || invoice.currency !== payload.currency) {
      throw new Error("ai_finance_target_unavailable");
    }
  }

  if (action === "finance.bill.create") {
    const suppliers = await listFinanceSuppliers(financeInput);
    if (!suppliers.some((item) => item.id === payload.supplierId)) {
      throw new Error("ai_finance_target_unavailable");
    }
  }

  if (action === "finance.expense.create" && payload.supplierId) {
    const suppliers = await listFinanceSuppliers(financeInput);
    if (!suppliers.some((item) => item.id === payload.supplierId)) {
      throw new Error("ai_finance_target_unavailable");
    }
  }
}

function proposalSummary(action: FinanceAIActionType,payload: Record<string,unknown>) {
  const currency = typeof payload.currency === "string" ? payload.currency+" " : "";
  const amount = typeof payload.amount === "string" ? payload.amount : "";
  const target =
    typeof payload.crmCustomerId === "string" ? " customer "+payload.crmCustomerId
    : typeof payload.supplierId === "string" ? " supplier "+payload.supplierId
    : typeof payload.invoiceId === "string" ? " invoice "+payload.invoiceId
    : "";

  return financeAIActionLabels[action]+target+
    (amount ? " for "+currency+amount : "")+
    ". This is only a proposal; no Finance write has executed.";
}

function proposalTool(input: {
  name: AIAccountantToolName;
  action: FinanceAIActionType;
  description: string;
}): ToolDefinition {
  const schema = financeProposalSchemas[input.action];
  return {
    name:input.name,
    description:input.description,
    risk:"proposal",
    requiresHumanApproval:true,
    inputSchema:schema,
    resultSchema:proposalResultSchema,
    providerDefinition:{
      name:input.name,
      description:input.description,
      inputJsonSchema:proposalJsonSchema(input.action),
    },
    async execute(context,raw) {
      const payload = schema.parse(raw) as Record<string,unknown>;
      await validateProposalTargets(context,input.action,payload);
      const proposalId = randomUUID();
      const payloadHash = sha256Json(payload);
      const expiresAt = new Date(Date.now()+15*60*1000).toISOString();

      await createAIActionProposal({
        proposalId,
        businessId:context.businessId,
        userId:context.userId,
        sessionId:context.sessionId,
        actionType:input.action,
        payload,
        payloadHash,
        expiresAt,
        correlationId:context.correlationId,
        financeEngine:context.financeEngine,
        executionMode:context.executionMode,
      });

      return {
        source:readSource(input.name,"action_proposal",context.defaultCurrency,[proposalId]),
        proposal:{
          id:proposalId,
          actionType:input.action,
          summary:proposalSummary(input.action,payload),
          payloadHash,
          expiresAt,
        },
      };
    },
  };
}

const registry: Record<AIAccountantToolName,ToolDefinition> = {
  finance_status:readTool({
    name:"finance_status",
    description:"Read the current Codeedge Finance engine status.",
    documentType:"finance_status",
    run:async (context) => ({
      data:await getFinanceStatus(context),
      currency:context.defaultCurrency,
    }),
  }),
  money_dashboard:readTool({
    name:"money_dashboard",
    description:"Read exact Codeedge Money dashboard totals including receivables, overdue receivables, payables and expenses.",
    documentType:"money_dashboard",
    run:async (context) => {
      const data = await getMoneyOverview(context);
      return { data,currency:data.currency };
    },
  }),
  list_customers:readTool({
    name:"list_customers",
    description:"List up to 50 Finance customers with minimum necessary identity fields.",
    documentType:"customers",
    run:async (context) => {
      const rows=(await listFinanceCustomers(context)).slice(0,50);
      return {
        data:{ customers:rows.map((row)=>({
          id:row.id,crmCustomerId:row.crmCustomerId,name:row.name,externalRef:row.externalRef,
        })) },
        documentIds:rows.map((row)=>row.id),
      };
    },
  }),
  list_suppliers:readTool({
    name:"list_suppliers",
    description:"List up to 50 Finance suppliers with minimum necessary identity fields.",
    documentType:"suppliers",
    run:async (context) => {
      const rows=(await listFinanceSuppliers(context)).slice(0,50);
      return {
        data:{ suppliers:rows.map((row)=>({
          id:row.id,name:row.name,externalRef:row.externalRef,
        })) },
        documentIds:rows.map((row)=>row.id),
      };
    },
  }),
  list_quotes:readTool({
    name:"list_quotes",
    description:"List up to 50 Codeedge Finance quotations.",
    documentType:"quotes",
    run:async (context) => {
      const rows=(await listFinanceQuotes(context)).slice(0,50);
      return { data:{ quotes:rows },documentIds:rows.map((row)=>row.id) };
    },
  }),
  list_invoices:readTool({
    name:"list_invoices",
    description:"List up to 50 Codeedge Finance invoices including exact outstanding amounts and statuses.",
    documentType:"invoices",
    run:async (context) => {
      const rows=(await listFinanceInvoices(context)).slice(0,50);
      return { data:{ invoices:rows },documentIds:rows.map((row)=>row.id) };
    },
  }),
  list_payments:readTool({
    name:"list_payments",
    description:"List up to 50 accounting payment records. This never moves money.",
    documentType:"payments",
    run:async (context) => {
      const rows=(await listFinancePayments(context)).slice(0,50);
      return { data:{ payments:rows },documentIds:rows.map((row)=>row.id) };
    },
  }),
  list_bills:readTool({
    name:"list_bills",
    description:"List up to 50 supplier bills.",
    documentType:"bills",
    run:async (context) => {
      const rows=(await listFinanceBills(context)).slice(0,50);
      return { data:{ bills:rows },documentIds:rows.map((row)=>row.id) };
    },
  }),
  list_expenses:readTool({
    name:"list_expenses",
    description:"List up to 50 booked expenses.",
    documentType:"expenses",
    run:async (context) => {
      const rows=(await listFinanceExpenses(context)).slice(0,50);
      return { data:{ expenses:rows },documentIds:rows.map((row)=>row.id) };
    },
  }),
  chart_of_accounts:readTool({
    name:"chart_of_accounts",
    description:"Read the Finance Engine chart of accounts.",
    documentType:"chart_of_accounts",
    run:async (context) => ({
      data:{ accounts:(await getFinanceChartOfAccounts(context)).slice(0,100) },
    }),
  }),
  general_ledger:readTool({
    name:"general_ledger",
    description:"Read up to 100 normalized general-ledger rows from the Finance Engine.",
    documentType:"general_ledger",
    run:async (context) => ({
      data:{ ledger:(await getFinanceGeneralLedger(context)).slice(0,100) },
    }),
  }),
  trial_balance:readTool({
    name:"trial_balance",
    description:"Read the normalized trial balance from the Finance Engine.",
    documentType:"trial_balance",
    run:async (context) => ({
      data:{ trialBalance:(await getFinanceTrialBalance(context)).slice(0,100) },
    }),
  }),
  profit_and_loss:readTool({
    name:"profit_and_loss",
    description:"Read the exact Profit & Loss report from the active Finance Engine.",
    documentType:"profit_and_loss",
    run:async (context) => {
      const data=await getFinanceProfitAndLoss(context);
      return { data,currency:data.currency,asOf:data.asOf };
    },
  }),
  balance_sheet:readTool({
    name:"balance_sheet",
    description:"Read the exact Balance Sheet from the active Finance Engine.",
    documentType:"balance_sheet",
    run:async (context) => {
      const data=await getFinanceBalanceSheet(context);
      return { data,currency:data.currency,asOf:data.asOf };
    },
  }),
  cash_flow:readTool({
    name:"cash_flow",
    description:"Read the exact Cash Flow report from the active Finance Engine.",
    documentType:"cash_flow",
    run:async (context) => {
      const data=await getFinanceCashFlow(context);
      return { data,currency:data.currency,asOf:data.asOf };
    },
  }),
  propose_customer_creation:proposalTool({
    name:"propose_customer_creation",
    action:"finance.customer.create",
    description:"Prepare a Finance Customer creation proposal from an existing tenant CRM Customer. Does not execute it.",
  }),
  propose_quote:proposalTool({
    name:"propose_quote",
    action:"finance.quote.create",
    description:"Prepare a quote proposal. No Finance write occurs until Codeedge owner approval.",
  }),
  propose_invoice:proposalTool({
    name:"propose_invoice",
    action:"finance.invoice.create",
    description:"Prepare an invoice proposal. No Finance write occurs until Codeedge owner approval.",
  }),
  propose_supplier:proposalTool({
    name:"propose_supplier",
    action:"finance.supplier.create",
    description:"Prepare a supplier creation proposal. No Finance write occurs until Codeedge owner approval.",
  }),
  propose_bill:proposalTool({
    name:"propose_bill",
    action:"finance.bill.create",
    description:"Prepare a supplier bill proposal. No Finance write occurs until Codeedge owner approval.",
  }),
  propose_expense:proposalTool({
    name:"propose_expense",
    action:"finance.expense.create",
    description:"Prepare an expense proposal. No Finance write occurs until Codeedge owner approval.",
  }),
  propose_payment_record:proposalTool({
    name:"propose_payment_record",
    action:"finance.payment.record",
    description:"Prepare an accounting payment-record proposal only. This cannot charge a card, collect money or transfer bank funds.",
  }),
};

export const aiAccountantToolRegistry = registry;

export const aiAccountantProviderTools = Object.values(registry)
  .map((tool) => tool.providerDefinition);

export async function executeAIAccountantTool(
  context: AIAccountantToolContext,
  toolName: string,
  rawArguments: unknown,
) {
  const tool = registry[toolName as AIAccountantToolName];
  if (!tool) throw new Error("ai_tool_not_allowed");

  let parsed: unknown;
  try {
    parsed=tool.inputSchema.parse(rawArguments);
  } catch {
    throw new Error("ai_tool_validation_failed");
  }

  const result=await tool.execute(context,parsed);
  try {
    return tool.resultSchema.parse(result);
  } catch {
    throw new Error("ai_tool_result_invalid");
  }
}

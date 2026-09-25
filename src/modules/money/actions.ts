"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { withFinanceCapability } from "@/server/finance/capability";
import { loadFinanceContext } from "@/server/finance/context";
import {
  createFinanceBill,
  createFinanceExpense,
  createFinanceInvoice,
  createFinanceQuote,
  createFinanceSupplier,
  ensureFinanceCustomer,
  recordFinancePayment,
} from "@/server/finance/service";

export type MoneyActionState = { error?: string; success?: string };

function deterministicUuid(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0,16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
    hex.slice(16,20),hex.slice(20),
  ].join("-");
}

export async function configureDemoMoney(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).safeParse({
    currency: String(formData.get("currency") ?? "").toUpperCase(),
  });

  if (!parsed.success) return { error: "Choose a valid three-letter currency." };

  const { context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only the business owner can configure Codeedge Money." };
  }
  if (context.business.execution_mode !== "demo") {
    return { error: "Demo Finance can only be configured in a Demo workspace." };
  }

  try {
    await withFinanceCapability(async (db) => {
      await db.query(
        "select public.finance_configure_demo_connection($1,$2,$3)",
        [context.business.id,context.userId,parsed.data.currency],
      );
    });
  } catch {
    return { error: "Unable to configure Demo Finance." };
  }

  revalidatePath("/dashboard/money");
  return { success: `Demo Finance configured in ${parsed.data.currency}.` };
}

export async function seedDemoMoneyJourney(
  state: MoneyActionState,
): Promise<MoneyActionState> {
  void state;
  const { client,context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only the business owner can seed Demo Money." };
  }
  if (context.business.execution_mode !== "demo") {
    return { error: "Demo Money is only available in a Demo workspace." };
  }

  const { data: customer,error } = await client
    .from("customers")
    .select("id")
    .eq("business_id",context.business.id)
    .order("created_at",{ ascending:true })
    .limit(1)
    .maybeSingle();

  if (error || !customer) {
    return { error: "Convert at least one Lead to a CRM Customer before seeding Demo Money." };
  }

  let financeContext;
  try {
    financeContext = await loadFinanceContext({
      businessId:context.business.id,
      userId:context.userId,
      correlationId:randomUUID(),
    });
  } catch {
    return { error: "Configure Demo Finance and choose its currency first." };
  }

  if (financeContext.engine !== "demo_finance") {
    return { error: "The active Finance Engine is not Demo Finance." };
  }

  const currency = financeContext.defaultCurrency;
  const request = (label: string) =>
    deterministicUuid(`codeedge-money:${context.business.id}:${label}`);
  const correlationId = deterministicUuid(
    `codeedge-money:${context.business.id}:demo-journey`,
  );
  const now = new Date();
  const plusDays = (days: number) =>
    new Date(now.getTime() + days * 86400000).toISOString();

  try {
    await ensureFinanceCustomer({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      crmCustomerId:customer.id,
      requestId:request("customer"),
    });

    const quote = await createFinanceQuote({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      crmCustomerId:customer.id,
      currency,
      amount:"850.00",
      validUntil:plusDays(14),
      requestId:request("quote"),
    });

    const invoice = await createFinanceInvoice({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      crmCustomerId:customer.id,
      quoteId:quote.id,
      currency,
      amount:"850.00",
      dueAt:plusDays(21),
      requestId:request("invoice"),
    });

    await recordFinancePayment({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      invoiceId:invoice.id,
      currency,
      amount:"500.00",
      requestId:request("payment"),
    });

    const supplier = await createFinanceSupplier({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      name:"Demo Medical Supplies",
      email:"supplier@example.test",
      phone:"",
      requestId:request("supplier"),
    });

    await createFinanceBill({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      supplierId:supplier.id,
      currency,
      amount:"120.00",
      dueAt:plusDays(30),
      requestId:request("bill"),
    });

    await createFinanceExpense({
      businessId:context.business.id,
      userId:context.userId,
      correlationId,
      supplierId:supplier.id,
      category:"Clinic supplies",
      currency,
      amount:"45.00",
      incurredAt:now.toISOString(),
      requestId:request("expense"),
    });
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message.replaceAll("_"," ")
        : "Unable to seed Demo Money.",
    };
  }

  for (const path of [
    "/dashboard/money",
    "/dashboard/money/sales",
    "/dashboard/money/purchases",
    "/dashboard/money/accounting",
    "/dashboard/money/reports",
  ]) revalidatePath(path);

  return { success: "Demo Money journey is ready." };
}


const moneyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function moneyActionError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    finance_context_unavailable: "Configure Codeedge Money before creating finance records.",
    finance_customer_mapping_required: "The selected CRM customer could not be prepared for Finance.",
    finance_quote_unavailable: "The selected quote is not available for this customer.",
    finance_invoice_unavailable: "The selected invoice is unavailable.",
    finance_supplier_unavailable: "The selected supplier is unavailable.",
    finance_payment_amount_invalid: "Payment must be greater than zero and no more than the outstanding balance.",
    finance_capability_unavailable: "This write is not supported by the active Finance Engine.",
  };
  return messages[code] ?? "Unable to complete the Money action.";
}

async function v1MoneyWriteContext() {
  const { context } = await requireDashboardTenant();
  const finance = await loadFinanceContext({
    businessId: context.business.id,
    userId: context.userId,
    correlationId: randomUUID(),
  });
  if (finance.engine !== "demo_finance") {
    throw new Error("finance_capability_unavailable");
  }
  return { context, finance };
}

function optionalMoneyDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return moneyDateSchema.parse(text) + "T00:00:00.000Z";
}

function requiredMoneyDate(value: FormDataEntryValue | null) {
  return moneyDateSchema.parse(String(value ?? "")) + "T00:00:00.000Z";
}

function revalidateMoneyWrites() {
  for (const path of [
    "/dashboard",
    "/dashboard/money",
    "/dashboard/money/sales",
    "/dashboard/money/purchases",
    "/dashboard/money/accounting",
    "/dashboard/money/reports",
  ]) revalidatePath(path);
}

export async function createMoneyQuote(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    customerId: z.string().uuid(),
    amount: z.string().trim().min(1),
  }).safeParse({
    customerId: formData.get("customer_id"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: "Choose a CRM customer and enter a valid amount." };

  try {
    const { context, finance } = await v1MoneyWriteContext();
    const correlationId = randomUUID();
    await ensureFinanceCustomer({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
      crmCustomerId: parsed.data.customerId,
      requestId: randomUUID(),
    });
    await createFinanceQuote({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
      crmCustomerId: parsed.data.customerId,
      currency: finance.defaultCurrency,
      amount: parsed.data.amount,
      validUntil: optionalMoneyDate(formData.get("valid_until")),
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Quote created." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

export async function createMoneyInvoice(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    customerId: z.string().uuid(),
    quoteId: z.union([z.string().uuid(), z.literal("")]),
    amount: z.string().trim().min(1),
  }).safeParse({
    customerId: formData.get("customer_id"),
    quoteId: formData.get("quote_id") ?? "",
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: "Choose a CRM customer and enter valid invoice details." };

  try {
    const { context, finance } = await v1MoneyWriteContext();
    const correlationId = randomUUID();
    await ensureFinanceCustomer({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
      crmCustomerId: parsed.data.customerId,
      requestId: randomUUID(),
    });
    await createFinanceInvoice({
      businessId: context.business.id,
      userId: context.userId,
      correlationId,
      crmCustomerId: parsed.data.customerId,
      quoteId: parsed.data.quoteId || null,
      currency: finance.defaultCurrency,
      amount: parsed.data.amount,
      dueAt: optionalMoneyDate(formData.get("due_at")),
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Invoice created." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

export async function recordMoneyPayment(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    invoiceId: z.string().uuid(),
    amount: z.string().trim().min(1),
  }).safeParse({
    invoiceId: formData.get("invoice_id"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: "Choose an invoice and enter a valid payment amount." };

  try {
    const { context, finance } = await v1MoneyWriteContext();
    await recordFinancePayment({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
      invoiceId: parsed.data.invoiceId,
      currency: finance.defaultCurrency,
      amount: parsed.data.amount,
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Accounting payment recorded." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

export async function createMoneySupplier(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().max(320),
    phone: z.string().trim().max(80),
  }).safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { error: "Enter valid supplier details." };

  try {
    const { context } = await v1MoneyWriteContext();
    await createFinanceSupplier({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
      ...parsed.data,
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Supplier created." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

export async function createMoneyBill(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    supplierId: z.string().uuid(),
    amount: z.string().trim().min(1),
  }).safeParse({
    supplierId: formData.get("supplier_id"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: "Choose a supplier and enter a valid bill amount." };

  try {
    const { context, finance } = await v1MoneyWriteContext();
    await createFinanceBill({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
      supplierId: parsed.data.supplierId,
      currency: finance.defaultCurrency,
      amount: parsed.data.amount,
      dueAt: optionalMoneyDate(formData.get("due_at")),
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Bill created." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

export async function createMoneyExpense(
  _state: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  const parsed = z.object({
    supplierId: z.union([z.string().uuid(), z.literal("")]),
    category: z.string().trim().min(1).max(120),
    amount: z.string().trim().min(1),
  }).safeParse({
    supplierId: formData.get("supplier_id") ?? "",
    category: formData.get("category"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: "Enter valid expense details." };

  try {
    const { context, finance } = await v1MoneyWriteContext();
    await createFinanceExpense({
      businessId: context.business.id,
      userId: context.userId,
      correlationId: randomUUID(),
      supplierId: parsed.data.supplierId || null,
      category: parsed.data.category,
      currency: finance.defaultCurrency,
      amount: parsed.data.amount,
      incurredAt: requiredMoneyDate(formData.get("incurred_at")),
      requestId: randomUUID(),
    });
    revalidateMoneyWrites();
    return { success: "Expense created." };
  } catch (error) {
    return { error: moneyActionError(error) };
  }
}

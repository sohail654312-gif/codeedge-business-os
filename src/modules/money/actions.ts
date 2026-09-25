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
  _state: MoneyActionState,
): Promise<MoneyActionState> {
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

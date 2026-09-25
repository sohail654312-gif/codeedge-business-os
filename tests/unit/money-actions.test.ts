import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMoneyQuote } from "@/modules/money/actions";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadFinanceContext } from "@/server/finance/context";
import {
  createFinanceQuote,
  ensureFinanceCustomer,
} from "@/server/finance/service";

vi.mock("@/server/auth/session", () => ({ requireDashboardTenant: vi.fn() }));
vi.mock("@/server/finance/context", () => ({ loadFinanceContext: vi.fn() }));
vi.mock("@/server/finance/service", () => ({
  createFinanceBill: vi.fn(),
  createFinanceExpense: vi.fn(),
  createFinanceInvoice: vi.fn(),
  createFinanceQuote: vi.fn(),
  createFinanceSupplier: vi.fn(),
  ensureFinanceCustomer: vi.fn(),
  recordFinancePayment: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const businessId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: {},
    context: {
      userId,
      role: "owner",
      business: {
        id: businessId,
        name: "Business A",
        slug: "business-a",
        status: "active",
        timezone: "Asia/Karachi",
        execution_mode: "demo",
        created_at: "2026-09-25T00:00:00Z",
        updated_at: "2026-09-25T00:00:00Z",
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);
  vi.mocked(loadFinanceContext).mockResolvedValue({
    businessId,
    userId,
    executionMode: "demo",
    engine: "demo_finance",
    connectionId: "70000000-0000-4000-8000-000000000001",
    credentialEnvironment: null,
    correlationId: "80000000-0000-4000-8000-000000000001",
    externalAccountId: "",
    credentialKey: "",
    defaultCurrency: "PKR",
  });
  vi.mocked(ensureFinanceCustomer).mockResolvedValue({} as never);
  vi.mocked(createFinanceQuote).mockResolvedValue({} as never);
});

describe("standard Money V1 write actions", () => {
  it("uses trusted tenant identity and the Finance connection currency", async () => {
    const form = new FormData();
    form.set("customer_id", customerId);
    form.set("amount", "850.00");
    form.set("valid_until", "2026-10-10");

    expect(await createMoneyQuote({}, form)).toHaveProperty("success");
    expect(ensureFinanceCustomer).toHaveBeenCalledWith(expect.objectContaining({
      businessId,
      userId,
      crmCustomerId: customerId,
    }));
    expect(createFinanceQuote).toHaveBeenCalledWith(expect.objectContaining({
      businessId,
      userId,
      crmCustomerId: customerId,
      currency: "PKR",
      amount: "850.00",
      validUntil: "2026-10-10T00:00:00.000Z",
    }));
  });

  it("fails closed before a provider write when the active engine does not support V1 writes", async () => {
    vi.mocked(loadFinanceContext).mockResolvedValue({
      businessId,
      userId,
      executionMode: "sandbox",
      engine: "erpnext",
      connectionId: "70000000-0000-4000-8000-000000000001",
      credentialEnvironment: "sandbox",
      correlationId: "80000000-0000-4000-8000-000000000001",
      externalAccountId: "ERP",
      credentialKey: "finance_primary",
      defaultCurrency: "GBP",
    });

    const form = new FormData();
    form.set("customer_id", customerId);
    form.set("amount", "850.00");

    expect(await createMoneyQuote({}, form)).toEqual({
      error: "This write is not supported by the active Finance Engine.",
    });
    expect(ensureFinanceCustomer).not.toHaveBeenCalled();
    expect(createFinanceQuote).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMoney,
  currencyCodeSchema,
  decimalMoneySchema,
  minorUnitsToMoney,
  moneyToMinorUnits,
} from "@/server/finance/domain";
import {
  normalizeERPNextInvoiceStatus,
  normalizeERPNextQuoteStatus,
  createERPNextFinanceEngine,
} from "@/server/finance/erpnext-engine";
import {
  getFinanceEngineRegistration,
} from "@/server/finance/registry";
import { resolveERPNextFinanceCredential } from "@/server/finance/credentials";
import {
  createERPNextClient,
  ERPNextRequestError,
} from "@/integrations/erpnext/client";
import {
  assertFinanceExternalEffectAllowed,
  type FinanceExternalEffectContext,
} from "@/server/finance/execution";
import { ExternalEffectBlockedError } from "@/server/execution/external-effects";

function financePolicyCode(
  overrides: Partial<FinanceExternalEffectContext> = {},
) {
  const context: FinanceExternalEffectContext = {
    businessId:"20000000-0000-4000-8000-000000000001",
    executionMode:"production",
    action:"finance.write",
    provider:"erpnext",
    providerEnvironment:"production",
    correlationId:"80000000-0000-4000-8000-000000000001",
    simulated:false,
    engine:"erpnext",
    ...overrides,
  };

  try {
    assertFinanceExternalEffectAllowed(context);
  } catch (error) {
    expect(error).toBeInstanceOf(ExternalEffectBlockedError);
    return (error as ExternalEffectBlockedError).code;
  }
  throw new Error("Expected Finance external-effect policy to block.");
}

describe("Codeedge Money finance contracts", () => {
  afterEach(() => {
    delete process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON;
    vi.restoreAllMocks();
  });

  it("uses exact decimal strings and integer minor-unit arithmetic", () => {
    expect(decimalMoneySchema.parse("123.45")).toBe("123.45");
    expect(currencyCodeSchema.parse("PKR")).toBe("PKR");
    expect(moneyToMinorUnits("0.10") + moneyToMinorUnits("0.20")).toBe(BigInt(30));
    expect(minorUnitsToMoney(BigInt(30))).toBe("0.30");
    expect(addMoney(["0.10","0.20","10.00"])).toBe("10.30");
    expect(() => decimalMoneySchema.parse("0.001")).toThrow();
    expect(() => currencyCodeSchema.parse("gbp")).toThrow();
  });

  it("normalizes supported ERPNext document statuses and fails closed on unknowns", () => {
    expect(normalizeERPNextQuoteStatus("Open")).toBe("sent");
    expect(normalizeERPNextQuoteStatus("Ordered")).toBe("accepted");
    expect(normalizeERPNextInvoiceStatus("Partly Paid")).toBe("partially_paid");
    expect(normalizeERPNextInvoiceStatus("Overdue")).toBe("overdue");
    expect(() => normalizeERPNextQuoteStatus("Mystery"))
      .toThrow("finance_erpnext_quote_status_unsupported");
  });

  it("declares honest, different capabilities for Demo Finance and ERPNext", () => {
    expect(getFinanceEngineRegistration("demo_finance").capabilities)
      .toContain("cash_flow");
    expect(getFinanceEngineRegistration("erpnext").capabilities)
      .not.toContain("cash_flow");
    expect(() => getFinanceEngineRegistration("unknown")).toThrow("finance_unknown_engine");
  });

  it("rejects an untrusted non-HTTPS ERPNext provider endpoint", () => {
    process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON = JSON.stringify({
      finance_primary: {
        businessId:"20000000-0000-4000-8000-000000000001",
        baseUrl:"http://erp.example.test",
        apiKey:"abcdefgh",
        apiSecret:"abcdefgh",
      },
    });

    expect(() => resolveERPNextFinanceCredential(
      "finance_primary",
      "20000000-0000-4000-8000-000000000001",
    )).toThrow("finance_provider_config_invalid");
  });

  it("rejects an ERPNext credential alias owned by another tenant", () => {
    process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON = JSON.stringify({
      tenant_b: {
        businessId:"20000000-0000-4000-8000-000000000002",
        baseUrl:"https://tenant-b-erp.example.test",
        apiKey:"abcdefgh",
        apiSecret:"abcdefgh",
      },
    });

    expect(() => resolveERPNextFinanceCredential(
      "tenant_b",
      "20000000-0000-4000-8000-000000000001",
    )).toThrow("finance_credential_unavailable");
  });

  it("blocks Demo workspace from a live ERPNext Finance write", () => {
    expect(financePolicyCode({ executionMode:"demo" }))
      .toBe("external_effect_demo_live_blocked");
  });

  it("blocks Sandbox Finance from Production ERPNext credentials", () => {
    expect(financePolicyCode({
      executionMode:"sandbox",
      providerEnvironment:"production",
    })).toBe("external_effect_sandbox_production_blocked");
  });

  it("blocks Production Finance from Sandbox ERPNext credentials", () => {
    expect(financePolicyCode({
      executionMode:"production",
      providerEnvironment:"sandbox",
    })).toBe("external_effect_production_environment_blocked");
  });

  it("normalizes ERPNext HTTP failures without exposing provider response bodies", async () => {
    const fetcher = vi.fn(async () => new Response(
      "SECRET_PROVIDER_STACK_TRACE api_key=should-never-leak",
      { status:500 },
    ));

    const client = createERPNextClient({
      baseUrl:"https://erp.example.test",
      apiKey:"test_api_key",
      apiSecret:"test_api_secret",
    },fetcher as typeof fetch);

    let error: unknown;
    try {
      await client.listCustomers();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ERPNextRequestError);
    expect(String((error as Error).message)).not.toContain("SECRET_PROVIDER_STACK_TRACE");
    expect(String((error as Error).message)).not.toContain("api_key");
  });

  it("normalizes ERPNext finance reads behind the FinanceEngine adapter", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("Sales%20Invoice")) {
        return new Response(JSON.stringify({ data:[{
          name:"INV-0001",
          customer:"CUST-1",
          posting_date:"2026-09-25",
          due_date:"2026-10-25",
          grand_total:850,
          outstanding_amount:350,
          status:"Partly Paid",
          currency:"GBP",
        }] }),{ status:200,headers:{ "Content-Type":"application/json" } });
      }
      if (url.includes("frappe.auth.get_logged_user")) {
        return new Response(JSON.stringify({ message:"finance@example.test" }),{
          status:200,headers:{ "Content-Type":"application/json" },
        });
      }
      return new Response(JSON.stringify({ data:[] }),{
        status:200,headers:{ "Content-Type":"application/json" },
      });
    });

    const engine = createERPNextFinanceEngine({
      businessId:"20000000-0000-4000-8000-000000000001",
      baseUrl:"https://erp.example.test",
      apiKey:"test_api_key",
      apiSecret:"test_api_secret",
    },fetcher as typeof fetch);

    const context = {
      businessId:"20000000-0000-4000-8000-000000000001",
      userId:"10000000-0000-4000-8000-000000000001",
      executionMode:"sandbox" as const,
      engine:"erpnext" as const,
      connectionId:"70000000-0000-4000-8000-000000000001",
      credentialEnvironment:"sandbox" as const,
      defaultCurrency:"GBP",
      correlationId:"80000000-0000-4000-8000-000000000001",
    };

    await expect(engine.getStatus(context)).resolves.toMatchObject({ ok:true });
    await expect(engine.listInvoices?.(context)).resolves.toEqual([expect.objectContaining({
      id:"INV-0001",
      status:"partially_paid",
      total:"850",
      outstanding:"350",
      currency:"GBP",
    })]);
  });
});

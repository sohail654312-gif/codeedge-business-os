import { describe, expect, it } from "vitest";
import { financeStatusHttpContract } from "@/server/finance/http-contract";
import {
  getFinanceEngine,
  getFinanceEngineRegistration,
} from "@/server/finance/registry";
import { resolveERPNextFinanceCredential } from "@/server/finance/credentials";

const smoke = process.env.CODEEDGE_ERPNEXT_SMOKE === "1"
  ? describe
  : describe.skip;

smoke("ERPNext disposable Finance Engine smoke", () => {
  it("uses current Finance credential mapping, engine boundary and status contract", async () => {
    const businessId = process.env.CODEEDGE_SMOKE_BUSINESS_ID;
    expect(businessId).toMatch(/^[0-9a-f-]{36}$/);

    const registration = getFinanceEngineRegistration("erpnext");
    expect(registration.environments).toContain("sandbox");
    expect(registration.capabilities).toEqual([
      "health",
      "customers",
      "suppliers",
      "quotations",
      "invoices",
    ]);

    const engine = getFinanceEngine({
      businessId: businessId!,
      engine: "erpnext",
      credentialKey: "ci_erpnext",
    });

    const context = {
      businessId: businessId!,
      userId: "10000000-0000-4000-8000-00000000e501",
      executionMode: "sandbox" as const,
      engine: "erpnext" as const,
      connectionId: "70000000-0000-4000-8000-00000000e501",
      credentialEnvironment: "sandbox" as const,
      defaultCurrency: "GBP",
      correlationId: "80000000-0000-4000-8000-00000000e501",
    };

    const status = await engine.getStatus(context);
    expect(financeStatusHttpContract(status)).toEqual({
      connected: true,
      message: "ERPNext connection ready.",
      compatibility: "Codeedge Finance Engine",
    });

    const customers = await engine.listCustomers?.(context);
    expect(customers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Codeedge Finance Smoke Customer" }),
    ]));

    expect(() => resolveERPNextFinanceCredential(
      "ci_erpnext",
      "20000000-0000-4000-8000-00000000ffff",
    )).toThrow("finance_credential_unavailable");
  });
});

import { describe, expect, it } from "vitest";
import { syncCustomerBackOffice } from "../../src/modules/buy-from-me/customers/sync";
import type { CustomerBackOfficeAdapter } from "../../src/integrations/customers";

const input = {
  businessId: "20000000-0000-4000-8000-000000000001",
  customerId: "60000000-0000-4000-8000-000000000001",
  name: "Alex Example",
  phone: "020 7946 0000",
  email: "alex@example.test",
};

describe("Customer back-office adapter boundary", () => {
  it("returns a successful external reference without exposing credentials", async () => {
    const adapter: CustomerBackOfficeAdapter = {
      syncCustomer: async () => ({ status: "synced", externalId: "CUST-0001" }),
    };
    await expect(syncCustomerBackOffice(adapter, input))
      .resolves.toEqual({ status: "synced", externalId: "CUST-0001" });
  });

  it("fails safely when the adapter reports failure", async () => {
    const adapter: CustomerBackOfficeAdapter = {
      syncCustomer: async () => ({ status: "failed", externalId: null }),
    };
    await expect(syncCustomerBackOffice(adapter, input))
      .resolves.toEqual({ status: "failed", externalId: null });
  });

  it("fails safely when the adapter throws", async () => {
    const adapter: CustomerBackOfficeAdapter = {
      syncCustomer: async () => { throw new Error("ERPNext unavailable"); },
    };
    await expect(syncCustomerBackOffice(adapter, input))
      .resolves.toEqual({ status: "failed", externalId: null });
  });
});

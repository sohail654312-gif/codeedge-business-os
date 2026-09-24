import type { CustomerBackOfficeAdapter, CustomerBackOfficeInput, CustomerBackOfficeSyncResult } from "@/integrations/customers";

export async function syncCustomerBackOffice(
  adapter: CustomerBackOfficeAdapter,
  input: CustomerBackOfficeInput,
): Promise<CustomerBackOfficeSyncResult> {
  try {
    return await adapter.syncCustomer(input);
  } catch {
    return { status: "failed", externalId: null };
  }
}

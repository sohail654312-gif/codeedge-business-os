import { createERPNextCustomer, getERPNextCustomerByName } from "@/integrations/erpnext";
import { getERPNextCustomerSyncConfig } from "@/integrations/erpnext/config";
import type { CustomerBackOfficeAdapter, CustomerBackOfficeInput, CustomerBackOfficeSyncResult } from "./types";

function reference(input: CustomerBackOfficeInput) {
  return `CE-CUST-${input.customerId}`;
}

export const erpnextCustomerAdapter: CustomerBackOfficeAdapter = {
  async syncCustomer(input): Promise<CustomerBackOfficeSyncResult> {
    const config = getERPNextCustomerSyncConfig(input.businessId);
    if (!config) return { status: "failed", externalId: null };

    const documentName = reference(input);

    try {
      const existing = await getERPNextCustomerByName(documentName);
      if (existing) return { status: "synced", externalId: existing.name };

      const created = await createERPNextCustomer({
        name: documentName,
        customer_name: input.name,
        customer_type: "Individual",
        customer_group: config.customerGroup,
        territory: config.territory,
      });

      return { status: "synced", externalId: created.data.name };
    } catch {
      return { status: "failed", externalId: null };
    }
  },
};

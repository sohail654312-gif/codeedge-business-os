export type CustomerBackOfficeInput = {
  customerId: string;
  name: string;
  phone: string;
  email: string;
};

export type CustomerBackOfficeSyncResult =
  | { status: "synced"; externalId: string }
  | { status: "failed"; externalId: null };

export interface CustomerBackOfficeAdapter {
  syncCustomer(input: CustomerBackOfficeInput): Promise<CustomerBackOfficeSyncResult>;
}

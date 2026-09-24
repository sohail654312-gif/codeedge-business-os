export type ERPNextConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type ERPNextCustomerSyncConfig = ERPNextConfig & {
  businessId: string;
  customerGroup: string;
  territory: string;
};

export function getERPNextConfig(): ERPNextConfig | null {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.ERPNEXT_API_KEY?.trim();
  const apiSecret = process.env.ERPNEXT_API_SECRET?.trim();

  if (!baseUrl || !apiKey || !apiSecret) return null;

  return { baseUrl, apiKey, apiSecret };
}

export function getERPNextCustomerSyncConfig(
  businessId: string,
): ERPNextCustomerSyncConfig | null {
  const config = getERPNextConfig();
  const boundBusinessId = process.env.ERPNEXT_BUSINESS_ID?.trim();
  const customerGroup = process.env.ERPNEXT_CUSTOMER_GROUP?.trim();
  const territory = process.env.ERPNEXT_TERRITORY?.trim();

  if (
    !config ||
    !boundBusinessId ||
    boundBusinessId !== businessId ||
    !customerGroup ||
    !territory
  ) {
    return null;
  }

  return {
    ...config,
    businessId: boundBusinessId,
    customerGroup,
    territory,
  };
}

export function getERPNextPublicStatus() {
  const config = getERPNextConfig();
  return {
    configured: Boolean(config),
    baseUrl: config?.baseUrl ?? null,
  };
}

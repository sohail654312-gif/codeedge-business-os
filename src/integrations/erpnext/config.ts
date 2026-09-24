export type ERPNextConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export function getERPNextConfig(): ERPNextConfig | null {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.ERPNEXT_API_KEY?.trim();
  const apiSecret = process.env.ERPNEXT_API_SECRET?.trim();

  if (!baseUrl || !apiKey || !apiSecret) return null;

  return { baseUrl, apiKey, apiSecret };
}

export function getERPNextPublicStatus() {
  const config = getERPNextConfig();
  return {
    configured: Boolean(config),
    baseUrl: config?.baseUrl ?? null,
  };
}

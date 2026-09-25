import "server-only";

import { z } from "zod";

const erpnextCredentialSchema = z.object({
  businessId: z.string().uuid(),
  baseUrl: z.string().url(),
  apiKey: z.string().min(8).max(300),
  apiSecret: z.string().min(8).max(300),
  customerGroup: z.string().min(1).max(120).optional(),
  territory: z.string().min(1).max(120).optional(),
}).strict();

export type ERPNextFinanceCredential = z.infer<typeof erpnextCredentialSchema>;

function safeTrustedBaseUrl(raw: string) {
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (url.username || url.password) {
    throw new Error("finance_provider_config_invalid");
  }
  if (!local && url.protocol !== "https:") {
    throw new Error("finance_provider_config_invalid");
  }
  if (local && !["http:", "https:"].includes(url.protocol)) {
    throw new Error("finance_provider_config_invalid");
  }

  return raw.replace(/\/$/, "");
}

export function resolveERPNextFinanceCredential(
  credentialKey: string,
  businessId: string,
): ERPNextFinanceCredential {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(credentialKey)) {
    throw new Error("finance_credential_unavailable");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(process.env.FINANCE_ERPNEXT_CREDENTIALS_JSON ?? "{}");
  } catch {
    throw new Error("finance_provider_config_invalid");
  }

  const map = z.record(z.string(), erpnextCredentialSchema).safeParse(parsedJson);
  if (!map.success) {
    throw new Error("finance_provider_config_invalid");
  }

  const credential = map.data[credentialKey];
  if (!credential || credential.businessId !== businessId) {
    throw new Error("finance_credential_unavailable");
  }

  return {
    ...credential,
    baseUrl: safeTrustedBaseUrl(credential.baseUrl),
  };
}

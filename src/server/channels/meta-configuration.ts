import "server-only";

/**
 * Configuration-only Meta WhatsApp preflight.
 * It never calls Meta or the database, and never returns sensitive values.
 * Successful preflight does NOT prove webhook subscription or live delivery.
 */
type MetaConfigurationEnv = {
  COMMUNICATION_DATABASE_URL?: string;
  WHATSAPP_META_APP_SECRET?: string;
  WHATSAPP_META_VERIFY_TOKEN?: string;
  WHATSAPP_META_GRAPH_API_VERSION?: string;
  WHATSAPP_META_CREDENTIALS_JSON?: string;
};

export function metaConfigurationReady(env: MetaConfigurationEnv = process.env): boolean {
  if (
    !env.COMMUNICATION_DATABASE_URL?.trim()
    || !env.WHATSAPP_META_APP_SECRET || env.WHATSAPP_META_APP_SECRET.length < 16
    || !env.WHATSAPP_META_VERIFY_TOKEN || env.WHATSAPP_META_VERIFY_TOKEN.length < 16
    || !/^v[0-9]+\.[0-9]+$/.test(env.WHATSAPP_META_GRAPH_API_VERSION ?? "")
  ) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(env.WHATSAPP_META_CREDENTIALS_JSON ?? "");
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const entries = Object.entries(parsed);
  if (entries.length === 0) return false;

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const digits = /^[0-9]{5,32}$/;
  for (const [alias, value] of entries) {
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(alias) || !value || typeof value !== "object" || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.businessId !== "string" || !uuid.test(entry.businessId)
      || entry.provider !== "meta_whatsapp_cloud"
      || (entry.environment !== "sandbox" && entry.environment !== "production")
      || typeof entry.externalSenderId !== "string" || !digits.test(entry.externalSenderId)
      || (entry.externalAccountId != null && (typeof entry.externalAccountId !== "string" || !digits.test(entry.externalAccountId)))
      || typeof entry.secret !== "string" || entry.secret.length < 20
    ) return false;
  }
  return true;
}

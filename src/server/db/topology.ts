import "server-only";

export type DatabaseHostClass =
  | "not_configured"
  | "supabase_direct"
  | "supavisor_transaction_pooler"
  | "supavisor_session_pooler"
  | "managed_pooler"
  | "other_postgresql";

export function classifyDatabaseHost(value: string | undefined): DatabaseHostClass {
  if (!value) return "not_configured";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "other_postgresql";
  }

  const host = url.hostname.toLowerCase();
  const port = url.port || "5432";

  if (/^db\.[a-z0-9-]+\.supabase\.co$/.test(host)) {
    return "supabase_direct";
  }

  if (host.endsWith(".pooler.supabase.com")) {
    return port === "6543"
      ? "supavisor_transaction_pooler"
      : "supavisor_session_pooler";
  }

  if (
    host.includes("pooler")
    || host.includes("pgbouncer")
    || host.includes("proxy")
  ) {
    return "managed_pooler";
  }

  return "other_postgresql";
}

function resolvedDatabaseUrls() {
  const communication = process.env.COMMUNICATION_DATABASE_URL;
  const chat = process.env.CHAT_DATABASE_URL;
  const voice = process.env.VOICE_DATABASE_URL ?? communication;
  const automation = process.env.AUTOMATION_DATABASE_URL ?? communication;
  const finance = process.env.FINANCE_DATABASE_URL ?? communication;
  const ai = process.env.AI_DATABASE_URL ?? finance ?? communication;

  return {
    communication,
    chat,
    voice,
    automation,
    finance,
    ai,
  };
}

export function restrictedDatabaseTopologySummary() {
  const urls = resolvedDatabaseUrls();
  return Object.fromEntries(
    Object.entries(urls).map(([name, value]) => [
      name,
      {
        configured: Boolean(value),
        hostClass: classifyDatabaseHost(value),
        poolMax: 3,
      },
    ]),
  );
}

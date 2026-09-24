import "server-only";

import { Pool, type PoolClient } from "pg";

export type CommunicationCapabilityDb = Pick<PoolClient, "query">;

export function communicationConnection(value: string | undefined) {
  if (!value) throw new Error("Communication database connection is not configured.");

  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Communication database connection must use PostgreSQL.");
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.has("uselibpqcompat")
  )) {
    throw new Error("Communication database connection requires verified TLS.");
  }

  return value;
}

let pool: Pool | undefined;

export async function withCommunicationCapability<T>(
  work: (db: CommunicationCapabilityDb) => Promise<T>,
): Promise<T> {
  pool ??= new Pool({
    connectionString: communicationConnection(process.env.COMMUNICATION_DATABASE_URL),
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  let broken = false;

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='8s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    await client.query("SET LOCAL ROLE codeedge_communication_api");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

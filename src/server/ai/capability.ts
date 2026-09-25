import "server-only";

import { Pool, type PoolClient } from "pg";
import { communicationConnection } from "@/server/channels/capability";

export type AICapabilityDb = Pick<PoolClient,"query">;

let pool: Pool | undefined;

export async function withAICapability<T>(
  work: (db: AICapabilityDb) => Promise<T>,
): Promise<T> {
  const connectionString = process.env.AI_DATABASE_URL
    ?? process.env.FINANCE_DATABASE_URL
    ?? process.env.COMMUNICATION_DATABASE_URL;

  pool ??= new Pool({
    connectionString: communicationConnection(connectionString),
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 12000,
  });

  const client = await pool.connect();
  let broken = false;

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    await client.query("SET LOCAL ROLE codeedge_ai_api");
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

import "server-only";

import {
  Pool,
  type PoolClient,
  type PoolConfig,
} from "pg";

export type RestrictedCapabilityDb = Pick<PoolClient, "query">;

export const restrictedDatabaseRoles = [
  "codeedge_communication_api",
  "codeedge_chat_api",
  "codeedge_voice_api",
  "codeedge_automation_api",
  "codeedge_finance_api",
  "codeedge_ai_api",
] as const;

export type RestrictedDatabaseRole =
  (typeof restrictedDatabaseRoles)[number];

type RestrictedClient = Pick<PoolClient, "query" | "release">;
type RestrictedPool = {
  connect(): Promise<RestrictedClient>;
};

export type RestrictedCapabilityConfig = {
  label: string;
  connectionString: () => string | undefined;
  role: RestrictedDatabaseRole;
  pool: {
    max: number;
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
  };
  transaction: {
    statementTimeoutMillis: number;
    lockTimeoutMillis: number;
    idleTransactionTimeoutMillis: number;
  };
};

export type RestrictedCapabilityDependencies = {
  createPool?: (config: PoolConfig) => RestrictedPool;
};

function positiveBoundedInteger(
  value: number,
  field: string,
  maximum: number,
) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Invalid restricted database ${field}.`);
  }
  return value;
}

function timeoutSql(name: string, millis: number) {
  return `SET LOCAL ${name}='${positiveBoundedInteger(
    millis,
    name,
    120_000,
  )}ms'`;
}

export function validateRestrictedDatabaseConnection(
  value: string | undefined,
  label = "Restricted",
) {
  if (!value) {
    throw new Error(`${label} database connection is not configured.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} database connection must be a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${label} database connection must use PostgreSQL.`);
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !local
    && (
      url.searchParams.get("sslmode") !== "verify-full"
      || url.searchParams.has("uselibpqcompat")
    )
  ) {
    throw new Error(`${label} database connection requires verified TLS.`);
  }

  return value;
}

export function createRestrictedCapability(
  config: RestrictedCapabilityConfig,
  dependencies: RestrictedCapabilityDependencies = {},
) {
  if (!restrictedDatabaseRoles.includes(config.role)) {
    throw new Error("Restricted database role is not allowed.");
  }

  const max = positiveBoundedInteger(config.pool.max, "pool max", 10);
  const connectionTimeoutMillis = positiveBoundedInteger(
    config.pool.connectionTimeoutMillis,
    "connection timeout",
    30_000,
  );
  const idleTimeoutMillis = positiveBoundedInteger(
    config.pool.idleTimeoutMillis,
    "idle timeout",
    120_000,
  );

  let pool: RestrictedPool | undefined;

  async function withCapability<T>(
    work: (db: RestrictedCapabilityDb) => Promise<T>,
  ): Promise<T> {
    pool ??= (dependencies.createPool ?? ((poolConfig) => new Pool(poolConfig)))({
      connectionString: validateRestrictedDatabaseConnection(
        config.connectionString(),
        config.label,
      ),
      max,
      connectionTimeoutMillis,
      idleTimeoutMillis,
    });

    const client = await pool.connect();
    let broken = false;

    try {
      await client.query("BEGIN");
      await client.query(timeoutSql(
        "statement_timeout",
        config.transaction.statementTimeoutMillis,
      ));
      await client.query(timeoutSql(
        "lock_timeout",
        config.transaction.lockTimeoutMillis,
      ));
      await client.query(timeoutSql(
        "idle_in_transaction_session_timeout",
        config.transaction.idleTransactionTimeoutMillis,
      ));
      await client.query(`SET LOCAL ROLE ${config.role}`);

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

  return {
    role: config.role,
    poolMax: max,
    withCapability,
  };
}

import { readdir } from "node:fs/promises";
import { Client } from "pg";

const root = new URL("../", import.meta.url);
const migrationsDirectory = new URL("supabase/migrations/", root);
const connectionString = process.env.MIGRATION_DATABASE_URL;

if (!connectionString) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const url = new URL(connectionString);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (
  !["postgres:", "postgresql:"].includes(url.protocol)
  || (!local && url.searchParams.get("sslmode") !== "verify-full")
) {
  throw new Error("MIGRATION_DATABASE_URL must use PostgreSQL with verified TLS.");
}

const expected = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => name.replace(/^\d+_/, "").replace(/\.sql$/, ""));

const client = new Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(
    "select name from supabase_migrations.schema_migrations order by version",
  );
  const applied = result.rows.map((row) => String(row.name));
  const appliedSet = new Set(applied);
  const expectedSet = new Set(expected);
  const missing = expected.filter((name) => !appliedSet.has(name));
  const unexpected = applied.filter((name) => !expectedSet.has(name));

  if (missing.length || unexpected.length) {
    process.stderr.write(
      [
        "Hosted migration parity check FAILED.",
        `Expected repository migrations: ${expected.length}`,
        `Applied hosted migrations: ${applied.length}`,
        missing.length ? `Missing: ${missing.join(", ")}` : "",
        unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : "",
      ].filter(Boolean).join("\n") + "\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Hosted migration parity verified (${expected.length}/${expected.length}).\n`,
    );
  }
} finally {
  await client.end().catch(() => undefined);
}

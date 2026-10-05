import { readdir } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { parseIntoClientConfig } from "pg-connection-string";

// Supabase CLI ledgers use suffixes; existing dashboard-applied ledgers may
// include the original file timestamp. Preserve ledger rows and compare identity.
export function migrationParity(expectedFiles, appliedNames) {
  const identity = (name) => String(name).replace(/\.sql$/, "").replace(/^\d{14}_/, "");
  const expected = expectedFiles.map(identity);
  const applied = appliedNames.map(identity);
  const expectedSet = new Set(expected);
  const appliedSet = new Set(applied);
  return {
    expectedCount: expected.length,
    appliedCount: applied.length,
    missing: expected.filter((name) => !appliedSet.has(name)),
    unexpected: applied.filter((name) => !expectedSet.has(name)),
    duplicates: applied.filter((name, index) => applied.indexOf(name) !== index),
  };
}

async function main() {
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
    .sort();

  // Parse first so sslmode cannot overwrite the explicitly trusted provider CA.
  const config = parseIntoClientConfig(connectionString);
  const ca = process.env.RESTRICTED_DATABASE_CA_CERT;
  if (ca) {
    const certificate = new X509Certificate(ca);
    const now = Date.now();
    if (!certificate.ca || now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
      throw new Error("RESTRICTED_DATABASE_CA_CERT must be a valid CA certificate.");
    }
    config.ssl = { ca, rejectUnauthorized: true };
  }
  const client = new Client(config);
  try {
    await client.connect();
    const result = await client.query(
      "select name from supabase_migrations.schema_migrations order by version",
    );
    const { missing, unexpected, duplicates, appliedCount } = migrationParity(
      expected, result.rows.map((row) => row.name),
    );

    if (missing.length || unexpected.length || duplicates.length) {
      process.stderr.write(
        [
          "Hosted migration parity check FAILED.",
          `Expected repository migrations: ${expected.length}`,
          `Applied hosted migrations: ${appliedCount}`,
          missing.length ? `Missing: ${missing.join(", ")}` : "",
          unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : "",
          duplicates.length ? `Duplicate identities: ${duplicates.join(", ")}` : "",
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

}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("Hosted migration parity check failed; verify database access and trusted TLS configuration.\n");
    process.exitCode = 1;
  });
}

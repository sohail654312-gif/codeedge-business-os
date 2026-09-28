# Audit 4 — Production Readiness Runbook

Status: Audit 4 operational release baseline

This runbook defines the minimum operational gates for Codeedge Business OS.
It does not authorize a public production launch and does not replace
environment-specific change approval.

## Release order

1. Confirm protected `main` and required CI are active.
2. Take and verify a recoverable database backup before any hosted migration.
3. Run `npm run schema:hosted-parity` with a server-only
   `MIGRATION_DATABASE_URL`.
4. If parity fails, stage and review missing forward migrations before applying
   them to the hosted database.
5. Run repository CI and targeted tenant/RLS tests.
6. Deploy an immutable application release to the controlled environment.
7. Verify `/api/health/ready`.
8. Run smoke tests only for the enabled pilot modules.
9. Record the release identifier and previous-known-good release.

## Rollback rule

Application rollback and database recovery are separate decisions.

- Application regression with no incompatible database change: restore the
  previous-known-good immutable application release.
- Migration failure before commit: allow the transaction to roll back and stop.
- Migration failure after a committed forward change: do not improvise a
  destructive down migration. Stop the affected capability and use a reviewed
  forward-fix or a verified database restore when required.
- Never disable RLS, tenant checks, or external-effect controls to simplify a
  rollback.

## Backup / restore closure gate

The connected Supabase organization is currently Free tier. Before REL-002 can
close, Part 3 must record:

- backup mechanism and off-site destination;
- backup timestamp and integrity evidence;
- non-destructive restore drill into an isolated environment;
- post-restore schema and tenant/RLS checks;
- explicitly approved RPO and RTO targets.

No RPO/RTO value is invented by this repository.

## Monitoring baseline

Public configuration readiness endpoint:

`GET /api/health/ready`

Production monitoring must alert on at least readiness failure, repeated webhook
5xx responses, Automation backlog/worker failure, provider/Finance ambiguous
outcomes, and database connectivity failure.

Central alert delivery, uptime monitoring, and worker heartbeat are Part 3
operational proof gates. Repository code alone is not evidence that alerts are
working.

## Hosted schema parity

`npm run schema:hosted-parity` compares repository migration names with
`supabase_migrations.schema_migrations` in the target database.

A failed parity check is a deployment blocker, not a warning.


## Online migration discipline

Every hosted schema change must be classified before application.

### Class A — additive / low lock risk

Examples:

- new nullable columns;
- new tables/types/functions;
- new RLS policies;
- bounded metadata changes.

Requirements:

1. prove a recoverable backup exists;
2. record target project and current migration parity;
3. record affected-table row counts/size;
4. review dependencies and application compatibility;
5. apply migrations strictly in repository order;
6. stop on the first failed migration;
7. re-run parity, schema contract and security/RLS checks.

### Class B — backfill / constraint tightening

Examples:

- data backfills;
- adding NOT NULL after a backfill;
- type/enum transitions;
- new uniqueness or foreign-key constraints.

Requirements in addition to Class A:

- separate expand/backfill/contract steps when the target contains meaningful data;
- backfill in bounded batches when a single transaction could hold locks or generate
  excessive WAL;
- prove the backfill predicate reaches zero remaining rows before tightening a
  constraint;
- never combine an irreversible data rewrite with an application cutover unless the
  compatibility window has been explicitly reviewed.

### Class C — lock-heavy / rewrite / destructive

Examples:

- dropping or renaming a column used by the current release;
- table rewrites on populated large tables;
- changing primary/unique keys;
- large ordinary index builds;
- destructive type conversions.

These are **not allowed through the routine release path**.

They require a dedicated change plan with:

- measured table size and row count;
- expected lock mode/duration;
- an explicit maintenance/low-traffic window when appropriate;
- expand/contract application compatibility;
- a tested forward-fix or verified restore decision;
- explicit operator approval before execution.

For large populated tables, prefer an online-safe index strategy supported by the
chosen execution mechanism. Do not assume a normal `CREATE INDEX` is harmless.

## Migration stop conditions

Stop immediately and do not continue the migration chain when any of these occurs:

- backup/recovery evidence is unavailable;
- target migration history is unexpected;
- an earlier migration fails;
- lock or statement timeout is reached;
- affected row counts differ materially from the reviewed preflight;
- RLS/tenant checks fail after a migration;
- the application compatibility assumption is no longer true;
- a provider/business external effect would be needed merely to validate schema.

Never repair migration history merely to make parity green without first proving the
actual hosted schema state.

## Expand / contract rule

For a populated production system:

1. **Expand** — add backwards-compatible schema.
2. **Deploy compatible application code** — old and new representations may coexist.
3. **Backfill** — bounded, observable, restartable.
4. **Verify** — no remaining old-state rows and no tenant/RLS regression.
5. **Contract** — only in a later reviewed release after old application versions can
   no longer depend on the old schema.

Dropping an old column/table in the same release that introduces its replacement is
not the default Codeedge migration pattern.

## Post-migration verification

After every hosted migration change:

- re-run repository/hosted migration-name parity;
- verify project health;
- run targeted RLS/tenant checks;
- run Supabase security advisors;
- verify expected row counts for any transformed data;
- run repository CI before application promotion;
- record the migration versions actually applied.

A green migration command alone is not sufficient evidence.

## Demonstrated Audit 4 application

Audit 4 Parts 1–4 exercised this discipline on the current hosted Business OS
database:

- backup evidence was captured first;
- the backup was restored into an isolated environment;
- the exact 20-migration suffix was reviewed before application;
- dependencies and higher-risk migrations were identified;
- the hosted project was confirmed to contain zero business/auth/storage data before
  application;
- migrations 10–29 were applied in exact order with stop-on-first-failure behavior;
- all 20 succeeded;
- post-application parity reached 29/29;
- project health remained ACTIVE_HEALTHY;
- 40/40 public tables had RLS enabled and forced;
- security advisor output was reviewed;
- no destructive down migration was attempted.

This demonstrates the current operational procedure. It does not claim that future
large-table migrations are automatically zero-downtime; those must be classified and
handled under the rules above.

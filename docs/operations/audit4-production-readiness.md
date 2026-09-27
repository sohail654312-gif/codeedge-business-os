# Audit 4 — Production Readiness Runbook

Status: Part 2 technical remediation baseline

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

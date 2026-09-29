# Audit 4 Final Closure — Part 8 Connection / Pool Verification

Status: **PARTIAL — live database capacity measured; deployed pool topology still requires staging/Vercel environment proof**

Repository baseline reviewed: `8e824312f20f072c0be3034a4543cae6f44a9d4a`

Hosted Supabase project:

- project: `CodeEdge Business OS`
- ref: `ljniurodhvbvpcztwlnh`
- PostgreSQL: 17.6
- status: `ACTIVE_HEALTHY`

## Live database evidence

Read-only `pg_stat_activity` / settings inspection showed:

- `max_connections`: **60**
- `superuser_reserved_connections`: **3**
- current connections: **13**
- current non-idle connections: **1**

The current project is lightly loaded, but this is not evidence of production-safe
application connection topology by itself.

## Application pool topology

The Business OS currently defines six restricted database capability pools:

- Communication
- Website Chat
- Voice
- Automation
- Finance
- AI

Each pool is bounded to **max 3** connections.

Therefore one warm application process can theoretically hold up to:

**6 pools × 3 = 18 connections**

The pool implementation also enforces:

- connection timeout: 3 seconds;
- idle timeout: 10–12 seconds;
- transaction-local statement timeout;
- transaction-local lock timeout;
- idle-in-transaction timeout;
- least-privilege login-principal attestation;
- bounded pool max validation (hard ceiling 10).

## Risk conclusion

With a direct PostgreSQL connection topology, multiple warm/serverless instances can
multiply the bounded pools:

- 1 warm process → up to 18 connections
- 2 warm processes → up to 36
- 3 warm processes → up to 54
- 4 warm processes → up to 72

The hosted database max is 60, before allowing room for Supabase Auth, Storage,
PostgREST, monitoring, administration and other services.

Supabase current guidance recommends using connection pooling/Supavisor for
serverless/concurrent workloads and monitoring connection usage.

## What can be verified now

- database connection capacity: verified;
- current live usage: verified;
- per-capability application bounds: verified;
- transaction and idle timeouts: verified;
- application pools are bounded, not unbounded: verified.

## Remaining blocker

The actual Vercel environment connection URLs cannot currently be inspected because
Part 5 has no authenticated Vercel write/environment path available.

Therefore this audit cannot yet prove whether
`COMMUNICATION_DATABASE_URL`, `CHAT_DATABASE_URL`,
`VOICE_DATABASE_URL`, `AUTOMATION_DATABASE_URL`,
`FINANCE_DATABASE_URL` and `AI_DATABASE_URL` use a Supavisor/session/transaction
pooler rather than direct database hosts.

No connection string or secret value should be written to audit evidence. The future
check only needs to record connection **mode/host class**, never credentials.

## REL-009 status

**REL-009 remains PARTIAL — capacity and code bounds verified; deployed pool topology pending.**

Part 5 staging access should verify the redacted host class for each configured
restricted database URL. If the serverless deployment uses a supported pooled topology,
REL-009 can be closed with connection-budget evidence.

No database setting or application pool size was changed during this verification.


## 29 September 2026 — safe deployed-topology proof path prepared

Part 8 preparation continued without waiting for Part 5 and without reading or
recording any database credential value.

A server-only topology classifier now maps configured restricted database URLs to
a redacted host class only:

- `supabase_direct`
- `supavisor_transaction_pooler`
- `supavisor_session_pooler`
- `managed_pooler`
- `other_postgresql`
- `not_configured`

An authenticated internal endpoint was added:

`GET /api/internal/operations/database-topology`

It requires the existing protected `AUTOMATION_RUNNER_SECRET` and returns only:

- whether each restricted capability URL is configured;
- the redacted host class;
- the configured pool maximum.

It does **not** return a hostname, username, password, query string, project reference
or complete connection URL.

The endpoint resolves the same fallback chain used by the application:

- Voice → `VOICE_DATABASE_URL` or Communication
- Automation → `AUTOMATION_DATABASE_URL` or Communication
- Finance → `FINANCE_DATABASE_URL` or Communication
- AI → `AI_DATABASE_URL`, then Finance, then Communication

Unit coverage verifies direct Supabase, Supavisor transaction pooler, Supavisor
session pooler and missing-value classification.

### Remaining Part 8 closure gate

After the Part 5 staging release is accepted by Vercel, call this endpoint against the
exact immutable staging deployment and record only the returned host classes.

REL-009 can close if the deployed topology and connection budget are acceptable.
If a restricted capability resolves to `supabase_direct` in the serverless staging
environment, that is a real topology finding and must be remediated rather than
relabelled.

No Part 5 branch, database data, provider traffic or MVP resource was changed by this
preparation.

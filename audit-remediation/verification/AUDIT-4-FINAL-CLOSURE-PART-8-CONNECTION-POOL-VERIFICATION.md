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

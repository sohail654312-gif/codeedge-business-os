# Codeedge Business OS — Audit 4 Source Report

## Baseline

- Repository: `sohail654312-gif/codeedge-business-os`
- Branch: `main`
- Audited SHA: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`
- Main moved during audit: **No**
- Main CI: push CI #630 succeeded at the audited SHA. Install, lint, typecheck, Vitest, production build and Playwright E2E all passed.
- Main protection: `protected=false`; no required status checks.
- No new GitHub Actions run was triggered by the audit.

## Production architecture evidence

Stable main is a Next.js App Router application using Supabase Auth/RLS for browser-facing tenant CRUD and restricted PostgreSQL capability pools for provider-facing/privileged domains. Capability pools are bounded and transactional:
- Website Chat: max 3 connections; 3s connection timeout; 8s statement timeout.
- Communications: max 3; 3s connection timeout; 8s statement timeout.
- Voice: max 3; 8s statement timeout.
- Automation: max 3; 12s statement timeout.
- Finance: max 3; 12s statement timeout.

All reviewed capability wrappers use explicit BEGIN/COMMIT/ROLLBACK, SET LOCAL ROLE, lock timeouts and idle-in-transaction timeouts.

Provider adapters:
- WhatsApp: Meta Cloud API.
- Email: Resend.
- SMS: Twilio.
- Voice: Vapi plus internal Demo Voice.
- Finance: Demo Finance plus ERPNext.

Automation uses Postgres domain events/runs/actions and an authenticated internal runner. Finance uses execution records, correlation/request IDs and a replaceable FinanceEngine boundary.

## Hosted Supabase evidence

Connected project:
- Project ref: `ljniurodhvbvpcztwlnh`
- Region: `ap-south-1`
- State: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1.166
- Organization tier: `tier_free`
- Security advisor findings: none at audit time.
- Performance advisor: INFO-only unused-index observations, consistent with a new/empty project.

### Confirmed schema drift

Repository stable main contains **26** ordered migrations through:
`20260925000900_codeedge_money_finance_core.sql`.

Hosted migration history contains only **9** migrations and stops at:
`crm_activity_history`.

Hosted public application tables observed:
`businesses`, `business_memberships`, `services`, `leads`, `lead_notes`, `quote_requests`, `customers`, `crm_activities`.

Therefore the connected hosted project lacks the merged schema for Business Information extensions, Conversations/Shared Inbox, Website Chat, WhatsApp/Email/SMS, execution-mode safety, Booking, Voice, Automation and Codeedge Money/Finance.

## Migration characteristics

All repository migrations are applied in sorted order to a fresh PGlite database by `tests/helpers/database.ts`, which gives useful syntax/order coverage.

The reviewed migration chain contains no DROP TABLE, DROP COLUMN or DROP TYPE statements. It is mostly additive. The Finance migration drops/re-adds an Automation trigger constraint. Several migrations contain data backfills and ordinary non-concurrent CREATE INDEX statements. `20260925000400_execution_safety_foundation.sql` backfills message delivery execution context before enforcing NOT NULL. This is acceptable for the current empty hosted project but needs online-migration discipline once tables become large.

## Provider and webhook failure evidence

WhatsApp, Resend and Twilio webhook routes return 5xx when trusted event processing fails, enabling provider retry behavior. Payload sizes and signatures/authentication are bounded/validated.

The Vapi route differs: after authentication and parsing, any `ingestVoiceProviderEvent` failure is returned as HTTP 400. Vapi documents 4xx as rejected/client-side outcomes and 5xx as server-side retryable outcomes, so a transient DB/runtime failure can become a permanently rejected Voice event.

Outbound Meta, Resend, Twilio and Vapi calls have 10-second AbortSignal timeouts.

The ERPNext client does not set an explicit request timeout.

## Automation reliability evidence

Positive controls:
- queued runs are claimed with `FOR UPDATE SKIP LOCKED`;
- stale running jobs older than 10 minutes are reset when attempts < 3;
- attempts >= 3 become failed;
- external Automation actions use deterministic request IDs;
- Demo external-effect actions are simulated and do not call real providers.

Operational gaps:
- repository contains no scheduler/cron/worker deployment that invokes `POST /api/internal/automation/run`;
- no worker heartbeat or queue-age alert exists;
- workflow causal chains have no correlation-depth/cycle/action-budget guard, so mutually triggering workflows can generate unbounded event chains even though each individual run has bounded retries.

## External-effect ambiguity evidence

Communications, Voice and Finance avoid blind duplicate retries after uncertain provider acceptance. This is a strong safety choice.

However, reconciliation is incomplete:
- communication provider success followed by local completion failure can leave a delivery in `sending` without a persisted provider ID;
- Finance marks exceptions thrown by the provider request path as `failed`, even though transport failures can be ambiguous after provider acceptance;
- successful provider response followed by local Finance persistence failure is surfaced as a provider-success/persist-ambiguous error, but no reconciliation worker/runbook was found;
- ERPNext has no explicit request timeout.

## Observability evidence

Strong durable domain records exist:
- message deliveries;
- Voice provider event ledger/call records;
- Automation domain events, runs and action runs with correlation/causation;
- Finance execution records with request/correlation/external references.

Repository evidence did **not** show:
- centralized structured application logging;
- Sentry/equivalent error tracking;
- uptime checks;
- alert policies;
- webhook failure alerts;
- Automation queue-age/worker-heartbeat monitoring;
- Finance ambiguity/failure alerts;
- a composite app/DB readiness endpoint.

Supabase platform logs exist, but they are not a substitute for Next.js/provider application monitoring.

## Build/release evidence

- No dependency lockfile is committed.
- CI uses `npm install`.
- No production deploy workflow or hosting manifest was found.
- No release tags or GitHub releases were found.
- No environment promotion or approval workflow was found.
- No application rollback runbook or database rollback policy was found.
- Main is not protected and CI is not required.

The manual ERPNext smoke workflow is stale relative to the current Finance architecture: it uses legacy ERPNEXT_* configuration and unauthenticated legacy response assertions while stable main Finance routes require tenant authentication and use normalized FinanceEngine behavior.

## Backup/recovery evidence

The connected Supabase project is on the Free plan. Current Supabase documentation states automatic daily backups are available on paid plans; a Free project must use an independent logical backup process if recoverability is required.

No repository backup job, off-site backup workflow, restore drill, retention target, RPO or RTO was found. PITR is supported by the platform but is not configured/verified for this project.

## Scale evidence

Current schemas contain many tenant/status/time/provider/request indexes. The hosted performance advisor only reports INFO-level unused indexes because the database is new/empty.

Scale concerns:
- Lead search hard-limits to 250 with no pagination (Audit 3);
- Customer directory loads all local customers;
- conversation/Automation/provider/audit histories have no retention/archival job;
- five module pools can theoretically consume up to 15 PostgreSQL connections per warm application instance if all are active;
- actual production hosting/pooler topology is not documented.

## Confirmed Audit 4 findings

| ID | Severity | Production classification | Finding |
| --- | --- | --- | --- |
| REL-001 | CRITICAL | PRODUCTION BLOCKER | Hosted Supabase is 17 migrations behind stable main. |
| REL-002 | HIGH | PRODUCTION BLOCKER | No verified recoverable backup/restore path on the current Free Supabase project. |
| REL-003 | HIGH | MUST FIX BEFORE PUBLIC PRODUCTION | Application monitoring/alerting/readiness is not operationalized. |
| REL-004 | HIGH | MUST FIX BEFORE PUBLIC PRODUCTION | Deployment/release/rollback process is undefined and main is unprotected. |
| REL-005 | HIGH | PRODUCTION BLOCKER — LIVE VOICE | Vapi ingestion failures return HTTP 400, suppressing retry for transient server failures. |
| REL-006 | HIGH | MUST FIX BEFORE PUBLIC PRODUCTION — AUTOMATION | Automation runner scheduler/liveness is not represented or verified. |
| REL-007 | HIGH | MUST FIX BEFORE PUBLIC PRODUCTION — AUTOMATION | No causal-chain/cycle/cost guard for recursive Automation workflows. |
| REL-008 | HIGH | MUST FIX BEFORE PUBLIC PRODUCTION — EXTERNAL EFFECTS/FINANCE | Ambiguous external completion lacks reconciliation; Finance can false-fail transport ambiguity; ERPNext lacks explicit timeout. |
| REL-009 | MEDIUM | PRODUCTION HARDENING | Database pool topology/pooler mode is deployment-sensitive and not verified. |
| REL-010 | MEDIUM | SCALE HARDENING | Migrations lack an online/rollback discipline for future large tables. |
| REL-011 | LOW | SCALE HARDENING | Retention/cleanup/pagination strategy is incomplete. |

Audit 4 totals: **1 Critical, 7 High, 2 Medium, 1 Low**.

## Non-destructive audit statement

No product code, migration, provider configuration, CI configuration, production data, PR #43 implementation or protected MVP content was changed during discovery. No real WhatsApp/SMS/Email message, phone call, payment or production Finance write was sent.

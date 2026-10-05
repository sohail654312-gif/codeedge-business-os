# CODEEDGE BUSINESS OS — REMEDIATION REGISTER

Original four-audit stable baseline: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`

## Audit 1

Audit 1 remediation: **8/8 VERIFIED — CLOSED**.  
PR #48 merged; protected-main and post-merge CI evidence remains recorded in the Audit 1 verification files.

## Audit 2

Remediation PR: #50 — **MERGED**  
Final PR head: `91a9c72293f5cc4f4d6482473e854d6693107e8a`  
Merge commit: `abaafe3bebb23b8c5dc2896aeac556971ffa0f72`  
Final PR CI #752: **GREEN**  
ERPNext disposable Finance Engine smoke #26: **GREEN**  
Post-merge main CI #753: **GREEN**

- SEC-001 — **VERIFIED AND MERGED** — Next.js/lockfile 15.5.26 and final security/dependency validation green.
- SEC-002 — **VERIFIED AND MERGED** — tenant-bound provider credential resolution and cross-tenant fail-closed tests.
- SEC-003 — **VERIFIED AND MERGED** — restricted DB LOGIN attestation occurs before role switching; Production credential provisioning was not modified.
- SEC-004 — **VERIFIED** — active `Protect main` ruleset 24045183 requires PR + strict `build`, blocks deletion/non-fast-forward updates and has no bypass actors.
- SEC-005 — **VERIFIED AND MERGED** — deterministic lockfile + `npm ci`.
- SEC-006 — **VERIFIED AND MERGED** — immutable GitHub Action SHAs and pinned reviewed Frappe Docker revision.
- SEC-007 — **VERIFIED AND MERGED** — explicit browser security policy and tests.
- SEC-008 — **VERIFIED AND MERGED** — tenant-isolated append-only security configuration audit events with actor attribution and safe metadata.
- SEC-009 — **VERIFIED AND MERGED** — tenant-safe retention/deletion policy represented without enabling destructive Production purge.

Audit 2 remediation closure: **9/9 VERIFIED — CLOSED**.

Safety: no Production Supabase change, Production deployment, live provider traffic or Production secret addition was used for closure. PR #46 was left untouched.

## Audit 3

Audit 3 is complete as an audit but has not yet received a dedicated formal remediation closure record.

## Audit 4

Audit 4 remediation is **ACTIVE / IN PROGRESS**.

Current verified main before this status sync:
`5caf6c4b0fb39b49a7a9bdacea6eddcb656d7908`

Post-merge CI #805: **GREEN**.

### Closed findings

- REL-001 — **VERIFIED / CLOSED** — hosted/repository migration parity 29/29.
- REL-005 — **VERIFIED / CLOSED** — trusted Vapi ingestion failures return retryable 503; malformed input remains 400.
- REL-007 — **VERIFIED / CLOSED** — database-enforced event/depth/external-effect circuit breakers pass exact boundary tests.
- REL-010 — **VERIFIED / CLOSED** — migration risk classes, stop conditions, expand/contract discipline and guarded hosted-apply procedure are verified.

### Partial / remaining findings

- REL-002 — backup + isolated restore technically verified; explicit RPO/RTO and recurring backup policy remain.
- REL-003 — readiness endpoint exists; current staging readiness and central alert-delivery proof remain.
- REL-004 — protected main + runbook verified; current staging deployment and rollback rehearsal remain.
- REL-006 — Automation runtime health verified; deployed scheduler cadence/heartbeat remains.
- REL-008 — timeout/ambiguity/retry suppression/reconciliation visibility implemented; controlled provider/sandbox reconciliation proof remains.
- REL-009 — DB capacity and bounded application pools verified; deployed Vercel pool topology remains.
- REL-011 — large-read hardening completed; retention/archive durations remain an explicit business-policy gate.

### Completed operational evidence

- backup evidence captured;
- isolated restore drill completed;
- migration delta reviewed before mutation;
- hosted migrations 10–29 applied in order;
- 29/29 hosted parity achieved;
- hosted project remained healthy;
- 40/40 public tables have RLS enabled and forced;
- controlled staging deployment workflow merged;
- Automation queue/runtime health inspected;
- connection capacity and pool bounds recorded;
- Finance ambiguous-result operator queue merged;
- scale hardening applied to remaining unbounded reads.

Audit 4 remains open until the explicitly listed operational/policy gates are closed.
Do not substitute historical Vercel deployments, guessed RPO/RTO, or invented retention
durations for real closure evidence.

## 5 October 2026 dedicated test evidence

See [final staging acceptance](FINAL-STAGING-ACCEPTANCE-2026-10-05.md).
REL-001 now has actual hosted 31/31 parity and 40/40 forced RLS. REL-009 has six
deployed transaction-pool summaries and six separate TLS-attested restricted
principals. REL-003 readiness is HTTP 200, with no error/fatal logs for the checked
Preview; alert delivery is still pending. REL-006 manual read-only health/probe
passes, while unattended cadence is pending. REL-002 has a fresh native snapshot
and restoration proof; DPAPI account dependency, independent durable destination
and owner RPO/RTO approval remain explicit. A new loopback-provider integration
rehearsal covers REL-008 accepted-write/network-loss ambiguity, persistence,
duplicate suppression and tenant-isolated operator read-back.

Evidence belongs to its recorded SHA and environment. Later candidate CI,
authenticated UI, rollback, Voice test-provider acceptance and owner policies
remain gates. Historical Audit 1/2 conclusions are preserved.

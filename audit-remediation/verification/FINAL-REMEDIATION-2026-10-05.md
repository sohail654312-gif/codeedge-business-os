# Final remediation candidate — 5 October 2026

Repository: `sohail654312-gif/codeedge-business-os`. Protected main fetched at `d518ac8431b33b0c88389412e6950818f5bd3090`. Review candidate: [PR #75](https://github.com/sohail654312-gif/codeedge-business-os/pull/75), `remediation/final-acceptance`. This is an implementation and evidence handoff, not staging acceptance or authority to merge.

## Implementation and integration

- Integrates #68 head `54fabd6879aade019b75c25e908157ad26a01d2e` and #74 head `b744a18947e25e207f7f33957a8d48708f1583c0` by a local integration merge. Main and the original PR branches were not changed. One candidate contains both fixes; the independent #74 Vercel rejection is not a new source regression.
- `af11a882ee15095c10c9c31d8c0ebf4e350c477b`: canonical Customer create/edit/search, narrow column grants, active owner/staff RLS, bounded 50-row Customer/Lead pages and exact filtered counts. No delete grant, external Finance write, identity reassignment or artificial Lead. Repeated creation with the same form identity cannot duplicate a Customer. Distinct contacts are not automatically merged by name/phone.
- `6984ab7d0c6a823c9da7924fa5f9f271de85a61f`: authenticated tenant-bound Finance settings, explicit read/write registry and fail-closed write checks; minimal operational setup checklist. Credentials/credential lookup keys are not returned by the Finance settings page.
- `33e2407365b79d03fb9ee05fac3b6d529f061058`: configuration validation in readiness, reviewed read-only #69 liveness implementation and #70 topology implementation, patched Vitest 4.1.11 and PostCSS 8.5.28. The manual liveness workflow has no schedule. Topology reports configuration classes, not successful database connectivity.
- `d7392764e3109d8e261bcbce58f940c7f8f90105`: LF checkout rules for schema fingerprint inputs. Original migration contents are unchanged; real drift rejection remains active.
- `091fd40`: Command Centre uses the exact Customer total after directory pagination; additional filtered Lead and Customer page boundary tests pass.
- #71 remains useful rollback preparation; #72 remains useful owner-policy preparation. Neither draft was merged. #73 design work remains unrelated and untouched.

## Verification evidence

Local implementation snapshot `33e2407365b79d03fb9ee05fac3b6d529f061058` plus LF-only correction: full suite **707 passed / 1 skipped**, production build PASS, Playwright **4/4 PASS**, lint/typecheck PASS, schema contract and deliberate drift rejection PASS. The skipped disposable ERPNext test is not a pass in the ordinary suite. The real disposable ERPNext workflow passed at `d7392764e3109d8e261bcbce58f940c7f8f90105`: [run 37264048410](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37264048410). Final CRM focused suite after the count follow-up: **19/19 PASS**. Final-head CI remains mandatory and is reported with the final handoff.

Earlier CI [37263831023](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37263831023) and [37263921438](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37263921438) failed at the schema fingerprint gate; corrected by LF checkout rules. The first upgraded-runner local attempt timed out during disposable database setup; rerun with an explicit 120-second setup budget passed. No failed/skipped case is relabelled as passed.

Production dependency audit: **0 advisories**. Full audit: **5 high development dependency findings**, all propagated from the unpatched `braces` chain used by the Next ESLint plugin. [Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release. Do not downgrade Next, remove lint/security checks or claim an all-clear dependency audit.

## Audit 3 — each finding reconciled

PASS below means sufficient evidence for the stated implementation scope, not production acceptance. PARTIAL/BLOCKED rows explicitly retain their acceptance gate.

| Finding | Verdict | Evidence / exact remaining gate |
|---|---|---|
| FUNC-001 | PASS | Owner-editable business timezone; owner/staff enforcement and timezone tests in passing suite. |
| FUNC-002 | BLOCKED | Provider-neutral Voice dispatcher, Vapi normalization and Codeedge tools exist. Need approved sandbox provider connection and explicit sandbox traffic approval to prove the complete model/tool loop, booking and handoff. Owner must supply/approve those; then record inbound tool calls, tenant isolation and outcome IDs. |
| FUNC-003 | PARTIAL | Scoped Command Centre data and exact Customer totals implemented. Authenticated staging screen acceptance awaits runtime credentials and migration parity. |
| FUNC-004 | PASS | Supported Demo Finance sales/purchase write surfaces reviewed; Demo critical-path E2E passes with zero external effects. Unsupported ERPNext writes fail closed. This does not certify ERPNext money writes. |
| FUNC-005 | PARTIAL | Workflow UI/history and read-only liveness probe implemented. Approved staging scheduler cadence and heartbeat proof remain REL-006. No schedule enabled. |
| FUNC-006 | PARTIAL | Canonical create/edit/search/pagination implemented; owner/staff, revoked, anonymous, forged business/actor, duplicate request and cross-tenant tests pass. Apply reviewed migration 31 after backup gate and verify authenticated staging screens. No Customer delete lifecycle is introduced. |
| FUNC-007 | PARTIAL | 50-row pages, deterministic ordering, filtered exact count, URL filter preservation and page metadata implemented. Tests cover >250 Leads, empty/end pages, forged business/service, malformed pages and filtered counts. Hosted migration/runtime acceptance pending. |
| FUNC-008 | PARTIAL | #74 conversion migration independently reviewed; atomic Won transition, idempotency and tenant isolation pass in disposable PostgreSQL. Hosted apply and runtime proof remain. |
| FUNC-009 | PASS | Global ERPNext configuration/status removed from settings. Uses authenticated tenant Finance context and safe primitive fields; existing Voice settings are tenant-bound and owner-controlled. Credentials remain server-only; unavailable context is displayed truthfully. Provider-specific runtime acceptance remains FUNC-002/REL-008. |
| FUNC-010 | PASS | Read/write capability sets differ; actual adapter write methods and metadata agree; service write gate fails closed for ERPNext supplier/quotation/invoice writes. |
| FUNC-011 | PASS | Authenticated business timezone used for CRM Lead/Note/Quote/activity display; DST/date tests pass. |
| FUNC-012 | PASS | Public CTAs route to signup; browser test passes. |
| FUNC-013 | PASS | Bounded Settings checklist covers profile, timezone, active services, hours, widget, booking test, Voice and Finance review. Saved configuration is not labelled runtime-ready. No redesign or automatic activation. |

## Migration engineering and hosted discrepancy

Candidate expects **31 migrations**: historical 29, #74 conversion migration 30 and CLI-generated `20261005041205_final_crm_directory_pagination.sql` migration 31. Disposable PostgreSQL applies all ordered migrations before security tests; no production URL is used.

Migration 30 preserves public invoker/private definer signatures and checks authentication plus active tenant membership before any write. Won transition and Customer insertion share the transaction; retry does not duplicate identity. Migration 31 is additive: nullable source Lead for direct Customers, contact-only update and creation column grants, an INSERT policy checking active owner/staff and `created_by = auth.uid()`, existing authoritative SELECT/UPDATE RLS, and invoker pagination functions. The existing Lead history trigger skips only direct Customers without a Lead. Finance mappings/FKs remain attached to canonical Customer IDs. No table/drop/data deletion or RLS disabling occurs.

Recovery strategy: application rollback to a verified compatible immutable deployment; retain additive database schema, inspect direct-Customer compatibility, and use a forward corrective migration if required. Do not restore NOT NULL while direct Customers exist or improvise down migrations. Database recovery uses a separately verified backup/restore procedure.

**Current hosted test evidence contradicts historical closure:** project `kffcywicqrtxdwgyvhvk` (`codeedge-business-os-test`) reports **27 ledger entries**, names prefixed with the original repository timestamps; `public.security_audit_events`, `private.security_configuration_audit()` and `public.automation_runtime_health()` are absent. **39/39** current public tables have enabled and forced RLS. Restricted capability roles are NOLOGIN/NOBYPASSRLS; usable restricted login principals/connection secrets were not found.

This is concrete current environment regression evidence for REL-001 and affected hosted acceptance, not a repeated full Audit 1/2 review. Preserve historical source closure, but never claim current hosted 29/29, 30/30 or 31/31. No hosted migration was applied: new recoverable backup evidence and restricted admin access were unavailable. Before applying, independently export/restore a current backup, reconcile legacy ledger naming against exact schema/definitions, review missing migrations 28–31, rerun disposable proof, and apply only to the confirmed dedicated test project. Independently verify names, functions, row policies and all 31 expected deltas afterward; do not insert fake ledger entries.

## Vercel and runtime evidence

Dedicated test project `prj_B55tV0GJmSzpiiTWYRaiSJugep3A`, team `team_a8T8lqP82nDRhkKg9qn0oiu7` only. Dashboard archive Install Command removal was accepted by the Vercel settings API; repository `installCommand: npm ci` remains. Next.js and eslint-config-next 15.5.27 provenance gate remains intact.

- `dpl_EaJgKNoe1RC4qopefVLf6R9VLZ5U`, exact `d7392764e3109d8e261bcbce58f940c7f8f90105`: READY, Preview (`target: null`). [Immutable preview](https://codeedge-business-os-test-9ph6cpe06-codeedge.vercel.app).
- Its readiness on 5 October: **HTTP 503**, `status:not_ready`, `configured:2`, `required:6`. It predates the branch URL setting. No current-stage readiness acceptance.
- Error/fatal runtime-log query for that exact deployment returned **no matching logs**. This is limited to the queried requests/window; it is not authenticated business-flow proof.
- Test Supabase URL was verified to reference `kffcywicqrtxdwgyvhvk`. The matching non-disabled publishable key was retrieved and configured for Preview without committing it. The verified final-remediation Preview branch alias was configured as NEXT_PUBLIC_APP_URL for this branch only.
- Missing approved Preview settings: CHAT_DATABASE_URL, COMMUNICATION_DATABASE_URL and AUTOMATION_RUNNER_SECRET. Local workspace environment files contain no usable credentials. Do not copy production credentials or use a privileged Postgres login to pass restricted attestation.
- Historical rollback deployment `dpl_5ox53kxHdv4kzissb4JvvubtPGJT` remains READY and untouched, but exposes no Git SHA metadata. It must be re-qualified for readiness/schema compatibility before a rehearsal. No promotion/rollback performed.

## Audit 4 — current disposition

| Finding | Verdict | Remaining action |
|---|---|---|
| REL-001 | PARTIAL | Historical closure retained; current test ledger/schema regression requires backup, missing-delta reconciliation and independent parity proof. |
| REL-002 | BLOCKED | Current recoverable backup/restore proof and owner-approved recurring policy needed. Proposed targets below are not accepted SLAs. |
| REL-003 | BLOCKED | Missing restricted DB credentials/runner secret; obtain readiness 200 plus authenticated runtime and alert delivery evidence. |
| REL-004 | BLOCKED | Re-qualify immutable rollback baseline and execute before/after readiness rehearsal only after accepted staging; record elapsed recovery time. |
| REL-005 | PASS | Preserved retryable trusted Voice webhook failure behavior; regression suite passes. |
| REL-006 | BLOCKED | Read-only probe/UI exist. Owner must approve nonproduction scheduler cadence and test credentials; prove heartbeat with zero external effects. |
| REL-007 | PASS | Existing event/depth/external-effect circuit breaker boundary tests pass. |
| REL-008 | PARTIAL | Timeout/ambiguity/retry suppression/reconciliation queue tests pass; actual controlled provider-sandbox reconciliation still requires approved connection and traffic scope. Ordinary disposable ERPNext status/read smoke does not prove this acceptance. |
| REL-009 | BLOCKED | Bounded pools and redacted configuration endpoint tested. Need approved restricted login URLs, deployed authenticated capture and role/pool connectivity attestation. |
| REL-010 | PASS | Forward migration discipline, disposable full-schema/RLS tests and guarded no-hosted-apply decision preserved. |
| REL-011 | BLOCKED | Queries/pages bounded. Owner must approve retention/archive/hold periods before any destructive lifecycle job. |

## Owner policy recommendations — not enabled or approved

Backup proposal: nightly encrypted recoverable backup, proposed **RPO 24 hours / RTO 4 hours**, daily copies for 30 days and weekly copies for 12 weeks in storage independent of the application. If business requirements need RPO under 24 hours, owner must select and fund verified PITR/WAL coverage before accepting that target. Restore to an isolated test database at least monthly; record actual achieved RPO/RTO, migration compatibility and tenant/RLS checks. No recurring backup/scheduler was enabled in this session.

Retention proposal for review: communications 12 months; CRM history archive review after 24 months of inactivity; delivery/webhook history 90 days; Automation history 90 days; AI transcripts 90 days; security audit history 12 months. Preserve unresolved idempotency, reconciliation, disputes and holds regardless of age. Finance reconciliation/accounting evidence must remain retained until the owner specifies an applicable accounting/legal policy; do not guess a purge deadline. Approve archive/export behavior and tenant-specific holds alongside durations. These are proposed review values, not deletion instructions; no data was purged.

## Smallest next action and stop conditions

Provision/store approved restricted nonproduction login connection URLs with verified TLS and the required capability memberships, plus an approved runner secret, in the dedicated Vercel Preview project. Supply a current recoverable backup/restore path for the test Supabase project, then reconcile/apply the verified missing deltas. Redeploy the exact accepted final PR SHA and verify readiness, authenticated Customer/Lead/settings flows, runtime logs, topology, monitor delivery, rollback and explicitly approved sandbox/scheduler acceptance. Keep PR #75 draft/unmerged until applicable gates pass. Main protection still requires strict `build`, a PR and no bypass actors.

No changes were made to MVP, CIGO or the website; no production DB/deployment, provider traffic, automated schedule, retention deletion or secret commit occurred.

# Codeedge Business OS V1

Release date: 6 October 2026 (Asia/Karachi).

This release integrates functional remediation PR #75 at
`584cbad3ac6c50246fcf9a122404881300f62055` with selected navy design PR #76 at
`09f536c7a948a4e95438b6397902fbe227b9d2ca`. The release PR and its merged commit
are the authoritative release identity; its acceptance record supplies final
SHA, CI run IDs, deployment identity and readiness evidence without embedding
a self-referential commit hash in this file.

## V1 scope

Authentication and workspace membership; tenant isolation and forced RLS;
Leads, Customers, five-stage pipeline and atomic Lead conversion with CRM history;
Shared Inbox and Website Chat; provider-neutral WhatsApp, Email and SMS adapters;
Bookings; Business Profile, Services, Areas, Hours and FAQs; Money/Finance,
ERPNext integration and AI Accountant; manual/on-demand Automation Engine;
AI Voice architecture, Demo Receptionist and Vapi integration point;
Demo/Sandbox effect safety; readiness and the selected Codeedge navy interface.

The shared navy shell, active navigation, search, page headers, cards, tables,
forms, buttons, badges, empty states, loading/error states and keyboard focus
apply across authenticated V1 screens. All metrics use workspace data; the
funnel represents cumulative current stages, excludes lost leads and makes no
claim about historical progression. No new database migration is required.

## Acceptance requirements and evidence

Protected main requires a PR and a strict GitHub Actions `build` status, with
no bypass actors. Release acceptance records the exact candidate SHA and
resulting main SHA, schema contract/drift gates, lint, typecheck, unit/security
and disposable database suites, production build, Playwright E2E, disposable
ERPNext smoke, authenticated critical-screen acceptance, Vercel READY and
`/api/health/ready` HTTP 200 with 6/6 configuration.

The 6 October live database baseline is `codeedge-business-os-test`,
`ACTIVE_HEALTHY`, with 31 repository/hosted migration identities and 40/40
public tables having enabled and forced RLS. Existing tenant-isolation,
Booking/Voice trusted capabilities and intentionally server-only tables are
preserved. Earlier authenticated conversion/Customer/Inbox/Booking acceptance
and backup/restore evidence remain in
[the staging record](../audits/FINAL-STAGING-ACCEPTANCE-2026-10-05.md).

The production dependency graph is patched to `source-map-js` 1.2.2 and has
zero npm audit findings. The development-only `braces` advisory
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published patched version; lint uses trusted repository patterns.
It is not an exposed production request path. No audit finding is suppressed.

## PR reconciliation

| PR | Disposition in V1 |
| --- | --- |
| #68 | Deployment/security provenance is already in the remediation ancestry. |
| #69 | Liveness workflow, probe and runner boundary are identical to the integrated implementation. Unique interpretation notes are preserved. |
| #70 | Topology endpoint, classifier and tests are identical to the integrated implementation; newer staging proof supersedes its preparation record. |
| #71 | Unique rollback preparation is preserved; newer staging rollback evidence supersedes its historical prerequisite. |
| #72 | Retention decision template is preserved. Destructive cleanup stays disabled and owner policy is post-V1. |
| #73 | Earlier visual concept is superseded by the owner-selected #76 design. |
| #74 | Functional delta is contained in #75 ancestry. |
| #75 | Functional source, fully contained in the integrated release. |
| #76 | Selected design source, fully contained in the integrated release. |

Superseded PRs close only after the accepted integration merges. Source branch
refs remain recoverable; no branch with unique history is deleted.

## Post-V1 operational integrations

- Five-minute unattended scheduling: current Vercel Hobby cadence is unsupported;
  manual/on-demand execution and runtime health remain. A supported scheduler
  or approved plan change is a future operational integration.
- Live Vapi credentials/phone number and production call acceptance; additional
  Voice providers.
- Custom SMTP recovery integration.
- Owner-approved retention durations and destructive cleanup (disabled).
- Recurring independent offsite backups and owner RPO/RTO policy; tested
  backup/restore evidence is retained.
- Advanced onboarding, enterprise BI, production alert-vendor delivery and
  additional marketing/social integrations.
- Leaked-password protection is enabled only where provider/account access and
  plan permit; it is not a V1 source-code blocker.

These scope decisions supersede historical operational gates in audit
preparation documents. They do not rewrite or claim formal closure of every
historical audit finding or prove live production providers.

## Rollback

Use the application rollback procedure in
[production readiness](../operations/audit4-production-readiness.md) and the
[preserved rollback preparation](../../audit-remediation/verification/AUDIT-4-FINAL-CLOSURE-PART-7-ROLLBACK-PROOF.md).
The final acceptance record identifies an immutable READY staging baseline.
Restore that application deployment/alias, verify readiness and runtime logs,
and preserve database state. Do not run destructive down migrations, disable
RLS or replay provider effects. Protected-main source recovery uses a reviewed
revert PR. No V1 release tag policy previously exists; the merged release PR
and exact commit are sufficient release identifiers.

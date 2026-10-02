# Audit 3 — functional delta reconciliation (controlled candidate)

Scope: `sohail654312-gif/codeedge-business-os`, original Audit 3 baseline `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`. Current protected `main` at branch start: `d518ac8431b33b0c88389412e6950818f5bd3090`. This is a **candidate evidence record, not a formal Audit 3 closure or production-readiness claim**. Preserve historical Audit 3 report unchanged.

## Findings reconciled individually

| Finding | Source state / delta | Pending acceptance |
| --- | --- | --- |
| FUNC-001 | Implemented on main: owner-editable business timezone in `src/components/settings/BusinessTimezonePanel.tsx` and workspace settings | Confirm owner/staff enforcement and main CI at integration |
| FUNC-002 | Partial: provider-neutral receptionist dispatcher and Vapi webhook/transport exist; production Vapi model/tool loop and safe live-provider acceptance not established | Controlled sandbox inbound/outbound tool invocation, tenant scoping, booking and handoff evidence; no live calls without approval |
| FUNC-003 | Implemented on main: `src/app/dashboard/page.tsx` uses scoped CRM, Bookings, Inbox, Automation and Finance results rather than fake authenticated KPIs | Authenticated staging proof |
| FUNC-004 | Implemented for supported Demo Finance: `src/app/dashboard/money/sales/page.tsx` and `purchases/page.tsx` render write forms; unsupported ERPNext writes remain explicitly disabled | Demo journey proof; do not infer ERPNext writes from read capabilities |
| FUNC-005 | Partial: `src/app/dashboard/automations/page.tsx` and `AutomationWorkspace` implement workflow UI/run history; deployed scheduler cadence still outstanding as REL-006 | Controlled scheduler/heartbeat acceptance after Part 5 |
| FUNC-006 | Open: `src/app/dashboard/buy-from-me/customers/page.tsx` still disables direct create/search; edit is not available | Dedicated canonical, tenant-safe Customer CRUD/search design, DB permissions and tests, no adapter bypass |
| FUNC-007 | Open: `supabase/migrations/20260924000600_lead_search.sql` limits search to 250; Lead screen labels `leads.length` as total | Bounded tenant-safe pagination + exact filtered count + order and RLS regression tests; never remove the limit without replacement bounds |
| FUNC-008 | **Candidate fix on this branch:** new forward migration `20261003000100_audit3_conversion_won.sql` updates the tenant-scoped source Lead to Won atomically on new and idempotent repeat conversion. Existing private definer/public invoker boundary and RPC signature are preserved. CRM status activity trigger records the change; security conversion tests extended | Exact-SHA CI, disposable DB checks, approved hosted migration parity review/application, then runtime proof |
| FUNC-009 | Open: `src/app/dashboard/settings/erpnext/page.tsx` still uses legacy global ERPNext public status and future-scope messaging | Tenant-bound provider-neutral settings surface, capability truthfulness and isolation tests |
| FUNC-010 | Partial: current `financeEngineMetadata.erpnext` lists health/customers/suppliers/quotations/invoices while adapter implements listing and Customer creation, not all writes; need distinguish read vs write in user-facing surfaces | Capability contract tests and UI proof that unsupported operations fail closed |
| FUNC-011 | **Candidate fix on this branch:** CRM Lead/Note/Quote/activity timestamps take authenticated `context.business.timezone`, not hardcoded UTC. Timezone/DST tests added | Exact-SHA CI and authenticated screen acceptance |
| FUNC-012 | **Candidate fix on this branch:** public homepage workspace CTAs now route to `/signup` rather than protected `/dashboard`; public entry E2E regression added | Exact-SHA E2E and preview acceptance |
| FUNC-013 | Open: workspace signup/provisioning exists, but a guided operational onboarding journey is still not implemented | V1 onboarding design and isolated first-run acceptance |

## Cross-program dependencies / release order

- Audit 1 and Audit 2 remain formally closed on main.
- Audit 4 is **not closed**; `REL-001/005/007/010` closed on main, seven partial. PR #68 has recovered a `READY` Vercel preview by explicitly overriding stale archive installation with `npm ci` at `54fabd6879aade019b75c25e908157ad26a01d2e`, with exact-SHA CI and disposable ERPNext smoke passing. That preview's `/api/health/ready` returned HTTP 503 `configured:0 required:6`, so staging configuration/monitoring and merge remain pending.
- The new FUNC-008 migration will change repository migration count from 29 to 30 **on this candidate branch only**. Never run this branch against existing hosted migrations without the Audit 4 backup → reviewed migration delta → protected apply → parity/RLS/security/restore discipline. Do not use a false 30/30 claim before hosted verification.
- Draft Audit 4 PRs #69–72 and design #73 remain separate. Do not merge them as an accidental dependency of this branch.
- No change to CIGO, original MVP, website, live providers, production data, retention deletion, secrets or scheduled automations.
- This PR must not be represented as closing all 13 findings. Next bounded remediation is FUNC-006/007/009, plus the dedicated provider and operations acceptance gates.

## Candidate verification checklist

- [ ] Exact-SHA `npm ci`, schema contract and drift rejection
- [ ] Lint, TypeScript, unit and security suites
- [ ] Disposable DB conversion, idempotency, cross-tenant and activity assertions
- [ ] Production build + Playwright public CTA E2E
- [ ] Disposable ERPNext integration
- [ ] Independent review and migration change approval before integration

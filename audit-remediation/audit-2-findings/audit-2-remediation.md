# CODEEDGE BUSINESS OS — Audit 2 Remediation Record

Audit: Security, Authorization & Tenant Isolation  
Historical audit baseline: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`  
Protected main at remediation continuation: `05cf307b40516a2b3253202776ff56eff0662474`  
Branch: `remediation/audit-2-security-tenant-isolation`  
Audit 2 PR: #50 — OPEN / NOT MERGED

This record preserves the historical Audit 2 finding set. It records delta remediation evidence only; it does not rewrite or restart Audit 2.

## Synchronization evidence

- Existing Audit 2 starting head: `33720d4ad3f28779d01340aedbaffda08dda56f0`.
- Current protected `main` was merged into the existing branch with merge commit `f05f8b4640fb3fced930efdf47c27ef6c224438a`.
- After synchronization the branch was 0 commits behind `main`.
- The old SMS/Resend typecheck failures were reproduced, confirmed as Audit 2 integration defects, and repaired minimally.
- No replacement Audit 2 branch was created.

## Finding verification

| Finding | Severity | Final branch status | Evidence |
|---|---|---|---|
| SEC-001 — vulnerable Next.js/RSC baseline | CRITICAL | **VERIFIED** | `package.json` and lockfile resolve Next.js `15.5.26`. Original RSC RCE GHSA-9qr9-h5gf-34mp is patched for the 15.5 line at 15.5.7. Later reviewed 2026 fixes affecting 15.5 are patched by 15.5.21/15.5.24; current 15.5.26 is beyond them. September 22 GHSA-vcvr-r3jv-pc5j affects Next 16.2.0–16.3.5, not 15.5.x. Branch CI #749 is GREEN. |
| SEC-002 — credential alias not bound to businessId | HIGH | **VERIFIED** | Shared server-only resolver requires canonical businessId + provider + environment + provider metadata before releasing a secret. WhatsApp, Email/Resend, SMS/Twilio and Voice/Vapi use it; Finance uses its business-bound ERPNext resolver. Tests prove both cross-tenant directions, unknown/legacy aliases, malformed IDs, provider/environment/metadata mismatch and fail-closed behavior. Automation communication actions route through the same tenant-bound channel services. |
| SEC-003 — restricted DB principal too powerful | MEDIUM | **VERIFIED** | Restricted capability runtime attests the LOGIN principal before role switching and rejects postgres, superuser, CREATEDB, CREATEROLE, replication, BYPASSRLS, INHERIT, non-login and session/current-user mismatch. Domain-specific roles, verified TLS, bounded pools and statement/lock/idle-transaction timeouts remain enforced. Tests prove privileged principals fail before `SET LOCAL ROLE`. Hosted credential provisioning remains a normal deployment prerequisite; no Production DB was modified. |
| SEC-004 — main protection absent | MEDIUM | **VERIFIED** | Live repository ruleset `Protect main` (24045183) is ACTIVE on the default branch; PR required; GitHub Actions `build` required; strict/up-to-date policy enabled; deletion and non-fast-forward/force push blocked; bypass list empty; current user cannot bypass. |
| SEC-005 — nondeterministic dependencies | MEDIUM | **VERIFIED** | Authoritative `package-lock.json`; CI and ERPNext use `npm ci`; clean deterministic install passed CI #749. |
| SEC-006 — mutable CI supply chain | LOW | **VERIFIED** | checkout pinned to `11d5960a326750d5838078e36cf38b85af677262` (v4.4.0), setup-node pinned to `49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0), Frappe Docker pinned to `3061850feface8fbbad15b5dc08a110c596107cb` (v3.2.2). No mutable Frappe default branch is used. |
| SEC-007 — browser security headers absent | LOW | **VERIFIED** | Middleware applies explicit CSP/frame policy, Referrer-Policy, X-Content-Type-Options and Permissions-Policy; HSTS is emitted for HTTPS only. Authenticated/ordinary routes deny framing; public Website Chat remains intentionally embeddable. Tests are GREEN. |
| SEC-008 — configuration audit events missing | LOW | **VERIFIED** | Migration adds tenant-isolated append-only `security_audit_events` with actor, tenant, event/resource, timestamp, correlation ID and safe before/after metadata. Channel/Email/Voice security configuration is audited without raw secrets/instructions. Tests prove authenticated actor attribution, tenant isolation and owner immutability. |
| SEC-009 — retention/deletion policy not represented | INFORMATIONAL | **VERIFIED** | `docs/data-retention-security.md` now represents the tenant-safe lifecycle policy, data classes, idempotency/cross-tenant invariants and separate Demo/Sandbox/Production behavior. It deliberately does not invent legal retention periods and does not enable a destructive Production purge. |

## SEC-003 deployment prerequisite

The application database LOGIN used by restricted capability pools must remain least-privilege in every deployed environment:

- LOGIN
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS
- NOINHERIT
- membership only in capability roles required by that runtime

The application now fails closed if this invariant is violated. Production credential provisioning/rotation is outside this remediation session and was not performed.

## SEC-009 operational boundary

No Production purge schedule is enabled. Business/legal policy owners must approve retention durations, legal holds, customer deletion/anonymization semantics, backup implications, Finance retention and security-audit retention before any destructive Production lifecycle automation is enabled. See `docs/data-retention-security.md`.

## Validation evidence

Branch head before this evidence-only documentation commit: `3305889d3b1a854fca5970d877f2b982af5f722f`.

CI #749: **GREEN / SUCCESS**, including:

- `npm ci`
- `npm run schema:check`
- `npm run schema:prove-drift`
- `npm run lint`
- `npm run typecheck`
- full `npm test`
- `npm run test:security`
- production build
- Playwright E2E

Previous pinned ERPNext disposable smoke #22: **GREEN**. PR #50 must provide current PR-level ERPNext evidence before final review.

No Production provider traffic, Production Supabase mutation, or original MVP modification was used for this verification.

## Closure rule

Audit 2 remediation is **9/9 VERIFIED ON THE REMEDIATION BRANCH**, but Audit 2 is **NOT CLOSED** because PR #50 is not merged and post-merge `main` CI has not run. This session must not merge PR #50.

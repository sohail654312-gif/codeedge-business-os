# Audit 2 Fix Verification Register

Branch: `remediation/audit-2-security-tenant-isolation`  
Stacked base: `b561fb7e404165fb8ac52039d9c40cb418921485`

| Finding | Verification target | Repository evidence | Current status |
|---|---|---|---|
| SEC-001 | Patched current Next/RSC graph + full regression | Next `15.5.26`; lockfile review; final CI required | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-002 | Tenant-bound credentials fail closed across WhatsApp, Email, SMS and Voice | `src/server/credentials/tenant-bound.ts`; provider adapters; unit regression suite | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-003 | Least-privilege login is attested before role switching | `src/server/db/restricted-capability.ts`; restricted-capability tests | PARTIALLY REMEDIATED — hosted provisioning/rotation remains external |
| SEC-004 | GitHub main protection actually enforced | Live repository control only; overlaps A1-01 | BLOCKED — EXTERNAL ACTION |
| SEC-005 | Lockfile + deterministic install | Reused from A1-02; `package-lock.json`; `npm ci` workflows | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-006 | Immutable CI/action/Frappe references | SHA-pinned GitHub Actions and Frappe Docker v3.2.2 commit | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-007 | Route-aware browser headers without breaking Website Chat | security-header module, middleware, unit/E2E coverage | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-008 | Actor-attributed, tenant-isolated append-only configuration audit | Audit 2 migration + security tests | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-009 | Approved retention/deletion policy | Decision matrix prepared; no durations selected | POLICY DECISION REQUIRED |

This register must not be used to claim production closure for SEC-003, SEC-004, SEC-007 HSTS, SEC-008 migration deployment, or SEC-009 policy until the corresponding external/operational evidence exists.

# CODEEDGE BUSINESS OS — Audit 2 Remediation Record

Audit: Security, Authorization & Tenant Isolation  
Historical audit baseline: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`  
Stacked base: Audit 1 remediation head `b561fb7e404165fb8ac52039d9c40cb418921485`  
Branch: `remediation/audit-2-security-tenant-isolation`

This record preserves the historical Audit 2 finding set. It records remediation evidence only; it does not rewrite or restart Audit 2.

## Delta verification

Current `main` observed at remediation start: `9db7bc4dcf9b301744bda7ad09769e21d7cdc44c`.

| Finding | Original severity | Original evidence | Current evidence / remediation | External dependency | Status before final branch CI |
|---|---|---|---|---|---|
| SEC-001 — Known-vulnerable Next.js / React Server Components baseline | CRITICAL | Audit baseline dependency graph | Next.js is locked to `15.5.26`, the currently released September 22, 2026 Maintenance-LTS security patch. React/React DOM are `19.1.1`. The lockfile contains no `react-server-dom-webpack`, `react-server-dom-parcel`, or `react-server-dom-turbopack` package. Full lint/typecheck/unit/security/build/E2E verification remains required on the final branch head. | Reverify against current official security guidance at closure. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-002 — Provider credential aliases are not bound to businessId | HIGH | Alias selected raw secrets without tenant binding | Shared server-only tenant-bound resolver now requires `businessId`, provider, environment and expected external sender/account metadata before returning a secret. WhatsApp/Meta, Resend Email, Twilio SMS, Vapi outbound and Vapi webhook bearer paths use trusted server context. Legacy raw alias mappings fail closed. Regression tests cover cross-tenant/provider/environment/metadata/missing/malformed cases. | None. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-003 — Direct DB capability pools need a least-privilege LOGIN boundary | MEDIUM | Connection principal was not attested before `SET LOCAL ROLE` | Restricted capability pool now attests `session_user` before role switching and rejects postgres, superuser, CREATEDB, CREATEROLE, replication, BYPASSRLS or INHERIT logins. Tests prove fail-closed behavior. | Real hosted LOGIN provisioning/rotation must be performed by an authorized DB administrator and verified in the hosted environment. | PARTIALLY REMEDIATED |
| SEC-004 — main has no branch protection / required checks | MEDIUM | `main` unprotected | Live repository verification still reports `main` unprotected. This is the same external control as Audit 1 A1-01; no source-code substitute is introduced. | GitHub repository administration. | BLOCKED — EXTERNAL ACTION |
| SEC-005 — Dependency resolution is not reproducible | MEDIUM | No lockfile; CI used `npm install` | Reuses Audit 1 A1-02: authoritative `package-lock.json`, `npm ci` in CI and ERPNext smoke. No duplicate implementation. | Audit 1 base must merge, then reverify main. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-006 — CI executes mutable third-party references | LOW | `actions/checkout@v4`, `actions/setup-node@v4`, Frappe default branch | Checkout pinned to `11d5960a326750d5838078e36cf38b85af677262` (v4.4.0), setup-node pinned to `49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0), Frappe Docker pinned to `3061850feface8fbbad15b5dc08a110c596107cb` (v3.2.2). Workflows retain `contents: read`. | Disposable ERPNext smoke must prove the pinned Frappe revision. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-007 — Application security-header policy is absent | LOW | No explicit browser header policy | Route-aware policy adds CSP/frame-ancestors, Referrer-Policy, nosniff, Permissions-Policy, and HSTS only for HTTPS requests. Authenticated/ordinary routes deny framing; public `/chat` routes remain intentionally embeddable. Unit + E2E regression required. | HSTS production enforcement can only be claimed after HTTPS deployment verification. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-008 — Sensitive configuration changes lack actor-attributed immutable audit events | LOW | Security-sensitive configuration lacked durable actor attribution | Migration adds tenant-isolated, append-only `security_audit_events` with actor, business, action/resource, timestamp, safe before/after metadata and correlation ID. Channel, Email and Voice security settings are audited; raw secrets and instructions are excluded. Security tests cover actor attribution, tenant isolation and mutation denial. | Migration must be applied to an authorized environment before production closure. | CANDIDATE VERIFIED — WAITING FOR BASE MERGE |
| SEC-009 — Retention/deletion policy is not represented | INFORMATIONAL | No retention/deletion model | Decision matrix prepared below. No retention periods are invented. | Business/legal policy approval. | POLICY DECISION REQUIRED |

## SEC-003 hosted least-privilege runbook

The application database login used by restricted capability pools must be provisioned outside the repository. Do not commit passwords or connection URLs.

Required properties for the hosted login:

- `LOGIN`
- `NOSUPERUSER`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOREPLICATION`
- `NOBYPASSRLS`
- `NOINHERIT`
- membership only in the Codeedge capability roles actually required by that runtime

Operational closure requires an authorized administrator to provision/rotate the hosted credential, update the deployment secret store, verify the runtime attestation succeeds, verify an intentionally privileged principal is rejected, then retire the previous credential according to the approved credential-rotation procedure.

## SEC-009 retention / deletion decision matrix

No retention duration is approved by this remediation. The table identifies decision inputs only.

| Data class | Contains PII? | Operational need | Audit/legal value | Can be anonymized? | Safe-deletion dependencies |
|---|---|---|---|---|---|
| Conversations | Often | Customer-service context and thread continuity | May support complaint/service history | Often partially | Preserve references needed by messages, leads/customers, bookings and audit evidence |
| Messages | Often | Inbox history, delivery context, support continuity | May support communication evidence | Body/content may be redacted or anonymized subject to policy | Preserve referential integrity, delivery/provider event linkage and required audit evidence |
| Voice transcripts | Often, potentially sensitive | Receptionist context, QA and follow-up | May support service/consent/complaint evidence | Usually possible with structured redaction/anonymization | Consider voice-call linkage, appointment/handoff evidence and any approved consent requirements |
| Provider event records | Sometimes identifiers/metadata | Idempotency, provider reconciliation and incident diagnosis | Useful for operational audit | Often partially | Do not break dedupe, delivery reconciliation or incident evidence |
| Delivery records | Contact/provider identifiers | Delivery state and retry safety | Useful for dispute and operational audit | Often partially | Preserve message linkage and idempotency/retry guarantees |
| Automation history | May include customer/resource identifiers | Debugging, replay safety and workflow history | Strong operational audit value | Often partially | Preserve idempotency, run/action linkage and security-event dependencies |
| Finance execution history | Financial/customer identifiers | Reconciliation, idempotency and accounting workflow trace | Potentially high accounting/audit value | Limited; aggregate/anonymize only where compatible with approved policy | Preserve accounting references, external execution IDs and any statutory/business retention obligations |
| Security audit events | Metadata may identify users/resources | Security investigation and accountability | High security/audit value | Select metadata may be minimized; event integrity must remain | Append-only guarantees and incident/audit obligations must be preserved |

Policy owners must decide the retention periods, deletion/anonymization triggers, legal holds, customer deletion behavior, backup behavior and whether any data class has mandatory minimum retention.

## Verification gate

Before upgrading a status beyond the states above, the final stacked branch must pass:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:security`
- `npm run build`
- E2E browser tests
- disposable ERPNext smoke after immutable Frappe pin

No production provider traffic is required or permitted for this verification.

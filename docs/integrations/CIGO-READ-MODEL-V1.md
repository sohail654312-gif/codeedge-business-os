# Business OS → CIGO read model v1

Contract identity: `codeedge-business-os-read-model:v1`

Business OS remains the operational source of truth. CIGO is a separate intelligence/evidence layer. This interface is server-only and read-only; it does not expose arbitrary SQL, provider credentials, authentication tokens, message bodies, booking notes or unrestricted database access.

## Boundary

Route: `GET /api/internal/cigo/v1/read`

The service credential is selected from the server-only `CIGO_READ_CREDENTIALS_JSON` grant map. Each credential key is bound to exactly one Business OS workspace. A request naming a workspace is not authority by itself; the bound server grant must match that workspace and the bearer secret must pass constant-time verification. Removing the grant revokes future reads.

Allowed v1 resources:

- `business_profile`
- `service`
- `lead`
- `customer`
- `crm_activity`
- `booking`
- `inbox_summary`
- `finance_summary`

The database boundary is `codeedge_internal.cigo_read_v1(...)`, executable only through the restricted `codeedge_cigo_read_api` capability role. A private `codeedge_internal.cigo_read_grants` table binds key ID + workspace + SHA-256 credential fingerprint, is unreadable to the capability role, and supports independent disable/revocation. The function contains the same allowlist and refuses any request whose server credential and database grant do not agree. A bounded private per-key rate state enforces the configured requests-per-minute limit across application instances.

## Data minimisation

Lead email/phone and enquiry free text are not projected. Customer email/phone/name are not projected. CRM activity actor IDs, descriptions and arbitrary metadata are not projected. Inbox subjects, message previews, message bodies, external thread IDs and channel credential fields are not projected. Booking contact fields and notes are not projected. Finance returns only Codeedge-local connection/execution summary metadata and explicitly labels its scope; it is not represented as an external accounting ledger snapshot.

## Pagination

Page size is bounded to 100 records. Business OS generates a confidential AES-256-GCM continuation cursor bound to workspace, resource, limit and expiry. Cursor keyrings are rotation-capable. CIGO may wrap the Business OS opaque cursor inside its own existing AEAD cursor; neither side accepts a raw caller-controlled database offset.

## Response

The deterministic envelope identifies contract version, source system, workspace, resource kind, observation time, records, pagination state, completeness and generic safe errors. Records use CIGO's operational evidence shape: workspace identity, BUSINESS_OS source reference, external source identity/version, resource kind, value and observed timestamp.

A successful HTTP read does **not** create a CIGO FACT or VERIFIED truth claim. CIGO must still pass the records through evidence intake, provenance/source-attestation, truth validation, memory and analysis.

## Server-only configuration

- `CIGO_DATABASE_URL` — optional dedicated restricted database connection, otherwise `COMMUNICATION_DATABASE_URL`.
- `CIGO_READ_CREDENTIALS_JSON` — key ID → `{ businessId, secret }`; secret minimum 32 characters.
- `CIGO_READ_CURSOR_KEYS_JSON` — key ID → 32-byte base64url AES key.
- `CIGO_READ_CURSOR_ACTIVE_KEY_ID` — active cursor encryption key ID.

No credential belongs in source control or normal request payloads.


## Abuse control and auditability

Authorization failures and source/rate-limit failures emit structured server logs containing only the request ID and non-secret scope identifiers. Secrets and credential fingerprints are never logged. Rate-limit exhaustion returns HTTP 429 with the same generic safe envelope rather than triggering an unbounded retry loop.

Database grants are provisioned by an administrator out of band; no grant secret or fingerprint is committed to source. Revocation can be performed independently at both layers: remove/rotate the server credential and disable or revoke the matching database grant.

## Acceptance evidence — 2026-10-07

**PASS for repository and synthetic staging acceptance; production release remains unapproved.** Frozen main `c705d2e2b2eb552015f79c412dce4d40e9bf1016` was merged normally into PR #78, preserving current V1 behavior and Mumbai/bom1 configuration. No protected history was rewritten.

Tested implementations: Business OS `e5a3c7d64940c79558c9318d446237340a32d620`; CIGO `f5b09214051550f4f4407aca17dc1a59d6c7887a`. Subsequent documentation-only descendants require final head checks, recorded in the PR acceptance report.

- [Business OS CI 37652747567](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37652747567): schema/drift, lint, typecheck, build, 751 unit, 342 security and 4 Playwright tests passed. One ERPNext smoke is intentionally skipped in ordinary CI and passed separately below.
- [ERPNext disposable acceptance 37653107373](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37653107373): PASS on the same implementation SHA, including fixture, authentication, Finance boundary and teardown.
- [CIGO CI 37652362206](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/37652362206): 270/270, zero skips; governance, typecheck/build, dependency/provenance checks PASS.
- [CIGO disposable PostgreSQL 37652362181](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/37652362181): 14/14, zero skips, including durable receipt restart, forced RLS, least privilege, atomic conflict rollback, revocation and expiry.

Protected staging: project `codeedge-business-os-test`, deployment `dpl_BiWkCsCoQCgs7x9WWGaH7DxNdzCv`, [Preview origin](https://codeedge-business-os-test-ebo73f7y3-codeedge.vercel.app), `bom1`, exact Business OS SHA above. SSO Deployment Protection remains enabled (`all_except_custom_domains`). Legitimate temporary Vercel access was privately exchanged for an origin-scoped cookie; protection settings were not weakened. No share tokens, cookies, service secrets or database passwords appear in evidence or source.

The actual server-run CIGO adapter called the protected route and hosted restricted projection; receipts used a separate disposable CIGO PostgreSQL database. This does not claim a deployed CIGO production service. Two newly provisioned synthetic workspaces in dedicated test Supabase project `kffcywicqrtxdwgyvhvk` were used; no real customer/provider records changed.

[Sanitized HTTP evidence](evidence/CIGO-READ-2026-10-07.json) records request IDs/statuses for all 12 passing groups: same-workspace success; CIGO/Business OS pagination; cross-workspace denial; unsupported resource; bad bearer; DB revocation; old key → revoke → rotated key; eight-resource minimisation; HTTP 429; cursor tamper/scope/limit binding; authentic expiry and retained-old-key rotation; denied direct table access. Valid receipt provenance passed while evidence remained UNVERIFIED, memory an ASSUMPTION, and analysis non-actionable. Business OS continuation now preserves the database's microsecond timestamp, preventing repeat rows caused by JavaScript Date truncation; a regression test covers that boundary.

Hosted database proof: 33/33 migration versions, no missing/unexpected/duplicate entries; 40/40 public tables force RLS. The dedicated staging LOGIN is NOINHERIT, lacks superuser/role-management/BYPASSRLS and has only the restricted capability membership. `anon`, `authenticated`, `service_role` cannot use/execute the private CIGO function. Same-tenant projection succeeds; cross-tenant, wrong fingerprint, revoked and unsupported requests fail SQLSTATE 42501. Direct operational/grant/rate-table SELECT is denied.

Runtime logs contained safe authorization/rate-limit/source-unavailable events and no tested secrets or synthetic private markers. The inspected window included rehearsals: 4 authorization, 2 rate-limit, 4 source-unavailable events. **No log drain is configured; external alert delivery remains untested.**

## Credential, cursor and rollback runbook

Provision only through trusted operators: create a random service secret, configure the server-only key/workspace map, and provision its SHA-256 fingerprint and rate limit in the private database grant. Use a dedicated restricted LOGIN for `CIGO_DATABASE_URL`; the communication fallback alone does not imply CIGO capability access. Prove same-tenant success and cross-tenant denial before use.

For service rotation, provision a new key/grant, deploy the map retaining both keys, switch CIGO's server config and prove the new key. Disable/revoke the old database grant immediately, remove its server mapping and redeploy. Environment changes affect new deployments; database revocation also protects existing immutable deployments. Staging proved old success → safe HTTP 503 after revocation → rotated success. Revoke remaining `acceptance_*` synthetic grants when Preview review ends.

For cursor rotation, add a fresh 32-byte key, change the active ID and deploy. Retain the previous decrypt key for at least the maximum cursor lifetime. Early removal invalidates existing cursors; clients restart pagination. Rotate CIGO's outer keyring independently with the same procedure. Neither keyring belongs in request input.

To disable, revoke private database grants first, remove the server credential map and stop the CIGO reader composition. Retain evidence and migration history; no operational/customer rows need changing. To roll back, redeploy an approved earlier integration revision through normal Git history with grants disabled until protected-preview conformance passes. Do not roll back frozen V1 or drop operational/evidence tables. CIGO receipt revocation is append-only and has no Business OS effects.

Remaining production gates: independent human review/merge approval; production server identities/credentials and tenant-pinned receipt roles; external alert destination/configuration/delivery if required. No merge, self-approval, production effect, customer communication, financial action or automation activation occurred.

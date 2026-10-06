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

The database boundary is `public.cigo_read_v1(...)`, executable only through the restricted `codeedge_cigo_read_api` capability role. A private `codeedge_internal.cigo_read_grants` table binds key ID + workspace + SHA-256 credential fingerprint, is unreadable to the capability role, and supports independent disable/revocation. The function contains the same allowlist and refuses any request whose server credential and database grant do not agree. A bounded private per-key rate state enforces the configured requests-per-minute limit across application instances.

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

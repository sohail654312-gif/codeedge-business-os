# Production Email channel

Codeedge Email is an external communication channel plugged into the existing canonical Conversation + Message core. It does not create a second CRM or a second inbox.

## Architecture

```text
Resend
  -> signed Email webhook / Email API
  -> Codeedge Resend provider adapter
  -> restricted communication capability
  -> Conversation + Message
  -> Shared Inbox
  -> Lead / Customer CRM
```

Resend is the first adapter because one provider supplies outbound API delivery, inbound receiving, signed webhook events and provider identifiers suitable for reconciliation. The provider boundary remains replaceable; Shared Inbox and CRM code do not depend on Resend internals.

## Tenant configuration

Each workspace can configure one Resend Email connection with:

- enable / disable state
- sender display name
- sender Email address
- optional Reply-To address
- inbound receiving address
- opaque server credential alias

The database stores only the credential alias. The actual API key lives in `EMAIL_RESEND_CREDENTIALS_JSON`.

Only workspace owners may change Email connection/settings rows. Owners and staff can read operational settings under RLS. The UI exposes only a configured/not-configured credential status and never returns the API key.

Inbound addresses are globally unique across enabled Codeedge Email configuration, so a signed provider recipient resolves to at most one tenant.

## Inbound Email

The public endpoint is:

```text
POST /api/channels/email/resend/webhook
```

Before tenant lookup, Codeedge:

1. enforces a 256 KiB webhook request limit
2. verifies the Svix `svix-id`, `svix-timestamp` and `svix-signature`
3. rejects stale signatures outside the replay window
4. validates the event schema and allowlists the Email event types it acts on

For `email.received`, the signed event supplies the provider Email ID and recipient address. Codeedge resolves the active tenant connection from that configured inbound address, then retrieves the full received Email from Resend using the server-only API key.

The adapter normalizes:

- sender address and display name
- recipients
- subject
- plain-text body
- RFC `Message-ID`
- `In-Reply-To`
- `References`
- Reply-To

Raw provider HTML is never rendered. If a message has no text part, Codeedge converts HTML to conservative plain text, removes script/style markup, and stores only the normalized text in the canonical Message body.

## Threading

Threading never relies on subject matching.

For an inbound Email Codeedge checks, in order:

1. an exact `In-Reply-To` RFC Message-ID match inside the same tenant and Email connection
2. RFC Message-IDs from `References`, but only when they identify exactly one existing conversation
3. otherwise, a new Email conversation is created

A new conversation stores its first RFC Message-ID as its external thread root. Outbound replies send `In-Reply-To` and `References` headers derived from the canonical thread metadata.

This intentionally prefers a new thread over merging ambiguous references.

## Idempotency

Inbound webhook retries are deduplicated by connection + provider + provider Email ID. Inbound processing is serialized per Email connection before the deduplication check, preventing concurrent retries from racing into duplicate conversations or Leads.

Outbound Shared Inbox replies use the existing stable request UUID and an outbox-style canonical Message + `message_deliveries` row before the provider call. The same request ID never issues a second provider call once it has an existing delivery attempt.

Resend also receives a stable `Idempotency-Key`.

If the provider accepts an Email but Codeedge cannot persist the acknowledgement, Codeedge leaves the delivery in the ambiguous `sending` state and does not auto-resend.

## Delivery state

Normalized Email states are:

- `sending`
- `queued`
- `sent`
- `delivered`
- `bounced`
- `failed`

Resend-specific errors are reduced to short provider-safe error codes. Raw provider responses and secrets are not shown in the core UI.

## CRM linking

A new inbound thread safely matches an existing Customer by normalized Email first, then an existing Lead in the same tenant. If neither exists, Codeedge creates one Lead with:

```text
source = email
```

A different thread from the same known Email address reuses the existing CRM identity rather than creating another Lead.

## Security boundary

The existing `codeedge_communication_api` PostgreSQL role remains the only transport capability:

- no login
- no inheritance
- no RLS bypass
- not assumable by browser roles

Authenticated browser users cannot execute Email transport RPCs and cannot directly insert a public outbound Message for an Email conversation. Internal notes remain local and never create Email metadata or delivery rows.

Email settings and Email message metadata both use forced RLS.

## Server environment

```text
COMMUNICATION_DATABASE_URL=
EMAIL_RESEND_WEBHOOK_SECRET=
EMAIL_RESEND_CREDENTIALS_JSON={"client_primary":"REPLACE_WITH_SERVER_SIDE_RESEND_API_KEY"}
```

The communication database connection must point to the same Postgres database. Hosted deployments require verified TLS as documented for the existing communication capability.

## Initial milestone limits

This production milestone intentionally supports plain-text conversational Email only.

Deferred:

- attachments and inline media
- full Email-client HTML fidelity
- bulk campaigns/newsletters
- marketing automation
- advanced Email analytics

Attachments are detected but not downloaded or exposed. Future attachment support must add MIME validation, size limits, malware/security handling, tenant-isolated private storage and private URLs before it is enabled.

## Reference use

The protected original Codeedge MVP remained read-only.

Tiledesk was used only as an omnichannel product reference: Email is presented as another channel inside one conversation experience. No Tiledesk source, runtime service, UI component, branding or infrastructure is included.

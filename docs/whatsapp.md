# Production WhatsApp Channel

WhatsApp is a production external channel for Codeedge Business OS. It feeds the existing canonical `conversations` and `messages` tables and the existing Shared Inbox. There is no separate WhatsApp CRM or WhatsApp inbox.

## Architecture

```text
Meta WhatsApp Cloud API
  -> signed Codeedge webhook
  -> restricted Codeedge communication capability
  -> canonical conversations(channel=whatsapp)
  -> canonical messages
  -> Shared Inbox
  -> owner/staff reply
  -> replaceable provider adapter
  -> Meta WhatsApp Cloud API
```

The communication boundary is intentionally provider-shaped rather than embedded into the Shared Inbox. Meta WhatsApp Cloud API is the first adapter. Future providers, including AI Voice, can use the same channel-connection and delivery seam without replacing the Conversation + Message core.

## Connection model

Each workspace can configure a WhatsApp connection with:

- Meta phone number ID
- optional WhatsApp Business Account ID
- display number/label
- an opaque server credential key
- enabled/disabled state

The database never stores the Meta access token. `credential_key` selects a token from the server-only `WHATSAPP_META_CREDENTIALS_JSON` environment variable.

The provider phone number ID is globally unique across Codeedge WhatsApp connections, preventing one external sender from being silently attached to two tenants.

## Inbound messages

The webhook:

1. verifies the raw request HMAC with `WHATSAPP_META_APP_SECRET`
2. validates the payload shape
3. resolves the workspace from the configured Meta phone number ID
4. derives the customer WhatsApp ID from the signed payload
5. reuses or creates one canonical WhatsApp Conversation
6. stores the inbound text as a canonical Message
7. links an existing Customer/Lead by normalized phone where possible, or creates a WhatsApp-source Lead

Provider message IDs are stored in `messages.channel_message_id` and retried webhook deliveries are idempotent.

Inbound messages reopen an existing resolved/closed WhatsApp conversation.

## Outbound replies

Internal notes remain local and never go to Meta.

For a public WhatsApp reply, the authenticated Shared Inbox action uses a restricted server capability rather than allowing the browser to forge an outbound provider message. Codeedge creates a canonical message with a unique request ID and a `message_deliveries` row before calling the provider. This is an outbox-style boundary that makes retries visible and prevents the UI from pretending an external send happened when no provider call exists.

Delivery states are:

- sending
- sent
- delivered
- read
- failed

When Meta accepts a message, the provider message ID is attached to the canonical Message and delivery row. Later signed webhook status events can advance it to delivered/read or record a provider failure.

If Meta accepts a message but Codeedge cannot persist the acknowledgement, Codeedge leaves the delivery in the ambiguous `sending` state and does not automatically resend. This avoids a duplicate customer message.

## Security boundary

A dedicated `codeedge_communication_api` PostgreSQL role has no login, no inheritance and no RLS bypass. Browser roles cannot assume it or execute the WhatsApp transport RPCs.

Normal authenticated users retain tenant-scoped read access through RLS. Owners configure channel connections; staff may read the connection status. Browser-authenticated message inserts are restricted so WhatsApp outbound replies cannot bypass the provider adapter.

Provider secrets are server-only:

- `COMMUNICATION_DATABASE_URL`
- `WHATSAPP_META_APP_SECRET`
- `WHATSAPP_META_VERIFY_TOKEN`
- `WHATSAPP_META_CREDENTIALS_JSON`

The Graph API version is explicit through `WHATSAPP_META_GRAPH_API_VERSION` rather than silently hard-coded forever.

## Initial scope

This first production WhatsApp phase supports inbound and outbound plain-text messages and delivery-status webhooks.

It intentionally does not yet include:

- media/attachments
- message templates
- proactive messaging outside the provider's customer-service window
- reactions
- location/contact payloads
- interactive buttons/lists
- voice calls

Unsupported inbound message types are ignored safely rather than creating a second messaging model. Template support can be added later through the same provider interface.

## Tiledesk reference use

Tiledesk was used only as a product/architecture reference for separating a multichannel conversation experience from a WhatsApp-specific service/module boundary. No Tiledesk source, UI components, infrastructure, branding, or runtime dependency is included in Codeedge.

# SMS channel

Codeedge SMS is an external communication channel built on the canonical Conversation + Message core and Shared Inbox. It does not create a separate inbox, CRM, customer store, or delivery-state model.

## Provider boundary

The first production adapter is Twilio Programmable Messaging. Codeedge owns the business workflow and exposes an SMS provider interface; Twilio supplies the SMS network rail. A future simulated/demo adapter or another provider can implement the same boundary without changing the canonical SMS business logic.

## Inbound

Twilio sends `application/x-www-form-urlencoded` webhooks to `/api/channels/sms/twilio/webhook`. Codeedge limits request size, parses only bounded fields, resolves the configured sender through the restricted communication capability, verifies the Account SID, validates `X-Twilio-Signature` using the server-side credential alias, then calls the tenant-safe `sms_receive_text` RPC.

Inbound provider Message SIDs are idempotency keys. Repeated callbacks do not create duplicate messages, conversations, or Leads.

Phone identity matching is scoped to the resolved business. Customer is preferred, then Lead, otherwise Codeedge creates a tenant-owned Lead with source `sms`.

## Outbound

Shared Inbox replies call the SMS server boundary. The restricted `sms_prepare_outbound` RPC verifies active membership, tenant, conversation, channel and connection, then creates the canonical outbound Message and MessageDelivery once per request UUID.

The Twilio adapter sends the SMS by the Messages REST API. If the provider rejects the request, Codeedge marks the delivery failed. If provider acceptance is ambiguous, Codeedge keeps the request in the in-flight state and does not automatically resend it.

Twilio status callbacks reconcile sending/queued/sent/delivered/failed without allowing stale events to downgrade a later delivery state.

## Security

- `codeedge_communication_api` remains NOLOGIN, NOINHERIT and NOBYPASSRLS.
- Browser roles cannot execute SMS transport RPCs or the private connection resolver.
- Raw Twilio Auth Tokens remain server-only in `SMS_TWILIO_CREDENTIALS_JSON`.
- Browser settings contain only an opaque credential alias.
- Twilio webhook signatures use the configured canonical application URL rather than the request Host header.
- The webhook resolves tenants only from a configured SMS sender identity; client-supplied business IDs are never trusted.
- Internal notes remain canonical local messages and are never passed to the SMS provider.

## Environment

`NEXT_PUBLIC_APP_URL` must be the exact externally configured application origin so Twilio signature validation uses the same webhook URL.

`SMS_TWILIO_CREDENTIALS_JSON` is a JSON object mapping opaque aliases to Twilio Auth Tokens, for example:

`{"client_primary":"REPLACE_WITH_SERVER_SIDE_TWILIO_AUTH_TOKEN"}`

The Account SID and sending phone number are tenant-owned non-secret channel configuration. Production credentials are not required by automated tests.

## Deferred

This phase intentionally does not implement Demo/Sandbox workspace mode, simulated SMS, Messaging Service sender pools, MMS/media storage, SMS marketing campaigns, opt-in campaign management, bulk notifications, Booking, Voice, Automation, or AI Employees.

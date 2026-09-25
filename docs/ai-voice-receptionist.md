# Codeedge AI Voice + AI Receptionist

## Ownership

AI Voice is a Codeedge Business OS capability. External telephony providers are replaceable adapters. Canonical business knowledge, CRM identity, Booking rules, Conversations, Messages, summaries, handoff state and tenant authorization stay in Codeedge.

## Provider boundary

The Voice domain depends on the Codeedge-owned `VoiceProvider` interface and capability metadata.

Implemented adapters:

- `demo_voice` — internal simulation only, zero live telephony.
- `vapi` — initial real adapter behind server-only connection configuration.

The registry is intentionally designed so future Retell, Bland, Twilio Voice, Telnyx, Vonage, SIP or custom adapters can be added without changing the Voice Call domain.

A real Voice `channel_connections` row uses:

- `channel = voice`
- `provider = vapi` for the first adapter
- `external_account_id` = provider assistant ID
- `external_sender_id` = provider phone-number/connection ID
- `display_address` = human-readable telephone number
- `credential_key` = opaque alias into server environment secret maps
- `credential_environment` = sandbox or production

No provider API key is stored in the browser-facing database model.

## Execution safety

Live outbound calls use:

Voice request → trusted DB preparation → execution-context recheck → central external-effect policy → provider registry → provider adapter.

The database snapshots execution mode, provider environment and correlation ID. If the current workspace/provider environment changes after preparation, dispatch fails closed.

Demo workspaces cannot prepare live calls. Sandbox workspaces cannot use production credentials. Unknown providers and unsupported environments fail closed.

Repeated outbound requests use a persistent correlation ID. An existing or ambiguous request is returned without automatically dialing again.

## Inbound security

Vapi webhook processing:

1. limits body size,
2. parses only the expected event shape,
3. derives the provider connection from the provider phone-number ID,
4. verifies a server-held bearer secret,
5. derives tenant identity from the connection,
6. normalizes provider state,
7. deduplicates provider events,
8. writes transcript utterances to canonical Messages.

Phone number alone is never tenant authentication.

## AI Receptionist

The first Codeedge role is the AI Receptionist. The model/provider is untrusted input.

The Codeedge tool dispatcher allows only explicitly authorized tools:

- business knowledge
- appointment availability
- get appointment
- create appointment
- reschedule appointment
- cancel appointment
- human handoff

Tool schemas are strict and never accept authoritative business ID, execution mode, credential environment or user permissions from the model.

Business knowledge comes from Codeedge Business Profile, Services, Service Areas, Opening Hours and active FAQs.

Booking tools reuse the existing Booking service and its timezone, duration, conflict and lifecycle validation.

## Demo flow

The dashboard route `/dashboard/contact-me/voice` is available as a safe simulator for Demo workspaces.

A successful scenario:

1. resolves a real active Codeedge Service,
2. checks real Codeedge availability,
3. creates/links a Demo Lead,
4. creates a canonical `voice` Conversation,
5. creates a `demo_voice` Voice Call,
6. books through the existing Booking engine,
7. stores caller and assistant transcript Messages,
8. stores a grounded summary/disposition,
9. completes the Demo call,
10. surfaces the Conversation in Shared Inbox and activity in CRM.

No production Voice credentials or telephone call are used.

## Current limitations

This milestone is a foundation, not a call-center product. It intentionally does not add mass cold calling, queues, full SIP infrastructure, recording storage, generalized multi-agent orchestration or Automation Engine.

Production Vapi requires tenant connection rows plus server-side API/webhook credentials. Recording remains optional.

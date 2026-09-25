# Communication core and execution safety

## Scope

This phase consolidates only proven common outbound communication behavior and adds the permanent execution-safety foundation for Demo/Sandbox workspaces. It does not implement Booking, Voice, polished Demo workspaces, seed data, or simulated provider experiences.

## Canonical communication architecture

Shared Inbox
→ Codeedge communication orchestration
→ channel-specific contract
→ provider adapter

The canonical Conversation, Message, `channel_connections`, and `message_deliveries` models remain the source of truth.

### Consolidated behavior

The shared outbound orchestration now owns behavior that was semantically identical across WhatsApp, Email, and SMS:

- existing request/idempotency state handling
- duplicate-safe treatment of in-flight requests
- execution-safety policy enforcement before provider resolution/dispatch
- provider exception normalization
- best-effort failed-delivery marking
- ambiguous accepted-but-not-persisted handling
- common message/status return shape

### Deliberately channel-specific behavior

The following remains outside the shared helper:

- WhatsApp recipient identity, Meta webhook semantics, and read receipts
- Email subject, RFC Message-ID, In-Reply-To, References, and bounce semantics
- SMS E.164 phone handling and provider delivery callback mapping
- every channel's database prepare/complete/reconcile RPC
- provider signature verification and inbound event parsing

No universal webhook validator or giant provider interface was introduced.

## Provider registry

The provider registry now records provider identity, channel, and approved environments.

Current registrations:

| Channel | Provider | Approved environment |
| --- | --- | --- |
| WhatsApp | `meta_whatsapp_cloud` | production |
| Email | `resend_email` | production |
| SMS | `twilio_sms` | production |

The existing channel-specific provider contracts remain separate. Future Demo or sandbox adapters can register explicitly without changing canonical business logic.

## Delivery states

The shared delivery enum remains:

- `sending` — common
- `queued` — common where the provider exposes queue acceptance
- `sent` — common
- `delivered` — common
- `failed` — common
- `read` — currently WhatsApp-specific
- `bounced` — Email-specific

Channel-specific reconciliation functions continue to enforce monotonic transitions appropriate to each provider.

## Workspace execution mode

`businesses.execution_mode` is one of:

- `demo`
- `sandbox`
- `production`

Existing workspaces default to `production` to preserve behavior.

Execution mode is server-trusted database state. Browser roles have no column permission to update it.

## Credential environment

`channel_connections.credential_environment` is one of:

- `sandbox`
- `production`

Existing connections default to `production`.

The value classifies the credential/configuration context without exposing the actual secret. Browser roles cannot update it. Raw secrets remain in server-only environment variables.

## External-effect policy

The reusable server policy fails closed:

- Demo + any live external effect → blocked
- Sandbox + production credential environment → blocked
- Production + sandbox credential environment → blocked
- invalid/unknown execution context → blocked
- simulated delivery accidentally routed toward a live adapter → blocked
- provider not approved for the selected environment → blocked

Current production adapters are registered for production only. Therefore a future Sandbox workspace also requires an explicitly approved sandbox-capable provider/adapter registration before a real test-provider call can execute.

## Trusted execution context

Outbound communication creates its canonical Message and MessageDelivery first. A database trigger snapshots trusted execution metadata onto the delivery:

- workspace execution mode
- provider credential environment
- provider
- request/correlation UUID
- simulated/live marker

Immediately before provider resolution, Codeedge loads both the current workspace/provider environment and the preparation snapshot through the restricted `communication_execution_context` RPC. If either changed between preparation and dispatch, Codeedge fails closed instead of trusting stale Production state.

The browser cannot provide or override those values.

## Auditability

`message_deliveries` now records:

- `execution_mode`
- `provider_environment`
- `correlation_id`
- `simulated`

Existing status, provider, provider message ID, and error code continue to record the delivery outcome. A blocked Demo/Sandbox live attempt is marked failed with a non-secret external-effect policy error code.

## Restricted capability

`codeedge_communication_api` remains NOLOGIN, NOINHERIT, and NOBYPASSRLS. It receives execute permission only for the narrow execution-context RPC; no broad table read/write permission is added.

## Future use

Booking, Voice, Automation, and AI Employees should inherit the same server execution-context and external-effect policy model.

Examples:

- Demo Booking → internal/demo calendar only
- Sandbox Booking → approved test calendar credentials only
- Production Booking → approved production calendar adapter
- AI Receptionist tool call → execution context → external-effect policy → provider

The full Demo Clinic, simulated communication adapters, resettable seed data, and polished Demo UI remain deferred.

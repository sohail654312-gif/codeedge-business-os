# Production Website Chat

Website Chat is the first live external channel for Codeedge Business OS. It feeds the existing canonical `conversations` and `messages` tables and the existing Shared Inbox. There is no second Website Chat inbox and no Tiledesk runtime dependency.

## Architecture

```text
Client website
  -> /widget.js
  -> /api/website-chat/<public-widget-id>
  -> narrow anonymous RPC capabilities
  -> website_chat_sessions
  -> canonical conversations(channel=website_chat)
  -> canonical messages
  -> Shared Inbox
  -> owner/staff reply
  -> visitor polling/history
```

The public widget UUID identifies a widget; it is intentionally **not a secret**. It never grants access by itself. Visitor authorization requires a separate 256-bit random session token. The browser holds that token in origin-local storage and sends it only to Codeedge in the `X-Codeedge-Chat-Session` header. Only the SHA-256 digest is stored in the database.

Sessions are bound to one public widget and therefore one tenant. They expire after 24 hours. Reloading the same site/browser resumes the session. A second browser gets a separate session and cannot access the first visitor's history. Conversation IDs are never used as public authorization credentials and are not returned by the public history API.

## Public database boundary

The anonymous Supabase role has no direct table access to businesses, memberships, CRM records, canonical conversations/messages, widget settings, or visitor sessions. The public API can call only five narrowly scoped security-definer functions:

- `website_chat_start`
- `website_chat_status`
- `website_chat_history`
- `website_chat_send`
- `website_chat_capture_lead`

Each function derives widget, tenant, session and canonical conversation server-side. Authenticated dashboard users are explicitly not granted these public capability functions.

Unknown widgets, suspended businesses, expired sessions and invalid inputs fail closed with generic public errors.

## Widget settings

Owners can configure Website Chat from Workspace Settings:

- enabled / disabled
- widget name
- launcher label
- greeting text
- welcome message
- unavailable message
- lead capture enabled / disabled
- simple accent colour

Staff may read configuration but cannot mutate it. The database generates the public widget ID; browser form input cannot choose the tenant or public ID.

## Installation

After the owner saves Website Chat once, Codeedge displays an embed snippet:

```html
<script
  async
  src="https://YOUR_CODEEDGE_HOST/widget.js"
  data-widget-id="PUBLIC_WIDGET_ID">
</script>
```

The script is dependency-free and self-contained. It derives the Codeedge API origin from its own `src`, so no database keys, session secrets or tenant UUIDs are embedded. The same snippet works in normal HTML and can be inserted into WordPress/CMS theme or script areas.

A hosted preview is available at:

```text
https://YOUR_CODEEDGE_HOST/chat/PUBLIC_WIDGET_ID
```

## Visitor and staff flow

The visitor opens the Codeedge launcher and starts/resumes a secure session. The first inbound message lazily creates a canonical Conversation with:

- `channel = website_chat`
- `status = open`
- visitor message `sender_type = customer`
- visitor message `direction = inbound`

The conversation immediately appears in the existing Shared Inbox. A staff/owner reply uses the existing canonical Message system:

- `sender_type = staff`
- `direction = outbound`

The widget polls every 3 seconds while open and every 7 seconds while closed. This is intentionally simpler than introducing Realtime infrastructure in the first production channel. A closed widget can show a small unread badge when a new staff message arrives. Reopening/reloading restores public history.

Internal notes are `direction = internal` and the public history capability explicitly excludes them.

## Lead capture

If enabled, a visitor can submit name plus phone or email. Contact validation reuses the existing CRM Lead validation rules. The database derives the tenant from the widget/session, creates one Website-source Lead for the conversation, and links the existing canonical Conversation to that Lead. Submitting updated contact details later updates the same Lead instead of creating a new Lead, preserving all prior chat history.

## Abuse and resource bounds

Public Website Chat is treated as an attack surface. Current controls include:

- strict request schemas; unknown fields rejected
- JSON-only request bodies
- 16 KiB HTTP body limit
- 2,000-character public message limit
- 256-bit session tokens with SHA-256 database representation
- 24-hour session expiry
- maximum 100 new visitor sessions per business per rolling 24 hours
- maximum 30 inbound visitor messages per session
- one inbound visitor message per two seconds
- UUID request IDs and database uniqueness for retry idempotency
- disabled widget and suspended tenant fail closed
- no public direct table access
- no public conversation IDs or staff user IDs
- generic public errors with no stack traces/database details

These application/database budgets are not a substitute for edge/WAF rate limiting or CAPTCHA under sustained abuse.

## Privacy

The visitor API returns only public message data required by the widget: sender category, public direction, plain-text body and timestamp. It does not return:

- internal notes
- another visitor's messages
- business UUIDs
- conversation UUIDs
- staff user IDs
- memberships
- ERPNext records
- private Business Settings
- AI prompts or secrets

The session token is a bearer credential stored in browser local storage. This avoids unreliable third-party cookies for an embeddable cross-site widget, but a malicious script already executing on the host client website could read that site's chat token. Production clients should maintain normal XSS protections and a restrictive Content Security Policy.

## Tiledesk reference use

Tiledesk was used only as a product/UX reference for ideas such as a persistent launcher, configurable branding, availability messaging, conversation continuity and human handoff. No Tiledesk source code, Angular components, Firebase/MQTT infrastructure, branding, or runtime dependencies are included in Codeedge.

## Current limits

This phase intentionally supports plain-text Website Chat only. It does not include attachments, audio/video, typing indicators, automatic AI replies, advanced assignment queues, WhatsApp, email, SMS or voice providers.

Staff delivery currently uses short polling rather than Supabase Realtime. The CI suite combines browser widget E2E with real PGlite SQL/RLS integration tests; it does not yet boot a full disposable hosted-equivalent Supabase stack for one single browser-authenticated test.

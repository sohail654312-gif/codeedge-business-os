# WhatsApp Auto-Reply — controlled draft integration (Phase 1)

**Implementation status:** draft-only code, not deployed or production-approved.
**Meta onboarding:** blocked until an eligible Meta developer account / test number is available.
**Protected original MVP:** `sohail654312-gif/codeedge` remains read-only.

## What this adds

- The existing signed Meta webhook continues to ingest text into canonical
  `conversations` and `messages`, with lead capture and deduplication unchanged.
- After canonical ingestion, a restricted communication capability plans a
  deterministic Codeedge response. Only the **server-side service role**
  can execute `whatsapp_plan_auto_reply`. The SQL validates the exact
  connection, tenant and customer inbound message before storing anything.
- `whatsapp_auto_reply_settings` is one owner-controlled, tenant-scoped switch
  (OFF by default) and a draft quota (1–800/month).
- `whatsapp_auto_reply_contacts` permanently mutes suggestions after a
  customer asks for a human or sends STOP. No automatic reactivation.
- `whatsapp_auto_reply_drafts` stores one decision per canonical inbound,
  with a durable unique constraint, tenant FKs and forced RLS. The latest
  suggestion appears beside the Shared Inbox timeline for manual staff use.
- **No automatic outbound transport, outbound Message, delivery row,
  Meta API request, AI provider request, or template send is created.**
  Staff must explicitly review and send through the existing composer.
- The draft quota is NOT the Meta billing counter and does not guarantee
  any free-message tier. Actual Meta pricing is based on delivered messages.

## Security invariants

1. Existing webhook HMAC signature and raw-body limits remain active.
2. Business/connection binding is derived from Meta's configured phone number ID.
3. Inbound canonical message ID is rechecked in the database within the same tenant.
4. SQL planner execution is withheld from `anon` and `authenticated`.
5. Owner-only settings mutation is enforced by RLS and column permissions.
6. Browser users cannot fabricate drafts, contact suppression or provider sends.
7. Replayed signed webhooks produce at most one persistent decision.
8. The business switch is OFF until the owner enables drafts.
9. A human/STOP handoff is persistent, not an in-memory flag.
10. The original external-effect and provider-credential controls are unchanged.

## Tests

- `tests/unit/whatsapp-auto-reply-policy.test.ts` for greeting/price
  rules, conservative fallbacks, STOP and human handoff.
- `tests/security/whatsapp-auto-reply-isolation.test.ts` for default
  OFF, durability, signed inbound identity binding, duplicate suppression,
  customer handoff, monthly cap, tenant RLS and no outbound delivery row.
- Existing Meta/Shared Inbox regression suites are not modified.

Run `npm run schema:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build` and `npm run test:e2e` on a safe
preview branch before approval. A green CI result is necessary but
**not sufficient** for production release. Audit 3/4 operational
readiness gates remain separate.

## Meta test number — deferred until account verification works

1. Recover Meta developer access and validate Codeedge business ownership.
2. Create a Cloud API app and use **Meta's temporary test phone number**.
3. Configure its temporary access token **only as a server secret**,
   sender phone-number ID, app secret and webhook verification token.
4. Use a dedicated disposable test business/tenant with correct
   execution mode and credentials. The existing Meta provider currently
   registers production environment only; do not relabel sandbox as
   production to bypass safeguards. Extend provider registration and
   exercise the approved sandbox policy before any live Meta test sends.
5. Send inbound test messages and verify canonical lead/inbox record,
   tenant isolation, one draft per message, STOP/handoff and no auto-send.
6. Only after an independent review should a second phase introduce a
   formally approved service actor + canonical outbox, 24-hour customer
   service window, billing/usage counters, throttling, opt-in and
   operator kill switch for automated transport.
7. Leave the actual Codeedge WhatsApp Business number untouched until
   test-number behavior and the owner's registration path are confirmed.

# Meta WhatsApp: next safe onboarding gate (30 October 2026)

## Verified owner progress
- The Codeedge Meta Developer app exists with **Connect with customers through WhatsApp** configured.
- The owner selected **Test Messaging Account** and authorized only current selected account access.
- Meta assigned a sandbox test sender; owner reports that Meta's template test message arrived on their own WhatsApp account.
- This proves the **Meta sender → recipient** test only. It is **not** an inbound Meta webhook → Business OS database/CRM test.
- The owner previously displayed a temporary access token in a screenshot. **Revoke/expire and regenerate before storing any token on Vercel. Do not store the exposed token.**

## Current backend blocker
The existing Vercel `codeedge-business-os-test` project had **no `WHATSAPP_META_*` environment variable names** in the connected environment listing inspected on 30 October. Current WhatsApp preview health was `not_configured`; no live connection has been certified. **Draft PR #83 is not merged.**

## Next owner actions (secrets never in chat)
1. In Meta App Settings → Basic, inspect the app's **App Secret**; do not paste it into ChatGPT/GitHub or screenshot it.
2. Generate a new strong random `WHATSAPP_META_VERIFY_TOKEN` privately, for Meta webhook challenge verification.
3. Regenerate the temporary WhatsApp access token (the earlier displayed one must be treated as compromised).
4. Using Vercel → **codeedge-business-os-test** → Settings → Environment Variables, configure **Preview, restricted to branch `feat/meta-whatsapp-cloud-api`**:
   - `WHATSAPP_META_APP_SECRET` — Meta app's App Secret
   - `WHATSAPP_META_VERIFY_TOKEN` — new private random value
   - `WHATSAPP_META_GRAPH_API_VERSION` — version confirmed in the owner's Meta app, not guessed
   - `WHATSAPP_META_CREDENTIALS_JSON` — single tenant-bound **sandbox** credential map containing Codeedge test workspace UUID, Meta test phone-number ID, WABA ID, a fresh token, and `provider: "meta_whatsapp_cloud"`
   - Preserve the existing restricted `COMMUNICATION_DATABASE_URL` (never use admin/service-role URL)
5. Do **not** enable AI replies or live sends; keep the workspace's external-effect policy intact.

These are server-side deployment secrets. Do not create or share an `.env` file in Git, send a token in a chat message, or type it into Codeedge's browser settings. Codeedge's browser settings store only the non-secret **credential alias**.

## Webhook prerequisite and endpoint
The draft route is `/api/channels/whatsapp/meta/webhook` (GET handshake, POST signed messages). The read-only, configuration-only route is `/api/channels/whatsapp/meta/health`. A 200 health status means structurally configured only; `liveConnectionVerified` remains false until explicit live acceptance. Never treat Meta's test-send success as webhook success.

**Deployment protection must be resolved safely before subscribing Meta**: the Vercel Preview project currently has authentication/SSO protection enabled. Meta's servers cannot complete the verification GET if routed to a protected page. Do not disable authentication for the entire Business OS dashboard, leak a Vercel bypass secret in the public callback, or switch to Production as a workaround. Use an explicitly reviewed narrow public webhook exposure or protected staging ingress design that keeps all dashboard routes private.

**Do not subscribe Meta until the safe public callback and database migration exist and a genuine GET challenge returns the exact challenge.** The additive WhatsApp migration in this PR has not been applied to the hosted test database; before application verify a new recoverable backup, actual 33-migration ledger and exact only-missing suffix. No blind replay of the two existing CIGO migrations.

Existing WhatsApp Business app/phone number must not be disconnected or migrated. Production number coexistence is a later, separately approved gate.

## Acceptance checklist
- [x] Codeedge Developer app and sandbox test sender created
- [x] Meta sandbox test message delivered to owner's existing WhatsApp
- [ ] Exposed temporary token replaced; new secret values stored server-side
- [ ] Safe public staging callback that does not expose dashboard or any bypass secret
- [ ] Fresh backup and staged SQL migration parity review
- [ ] Meta GET callback challenge succeeded from Meta servers
- [ ] Signed inbound message persisted as correct-tenant Lead/Conversation/Message
- [ ] Duplicate webhook retried with zero duplicate inserts or AI sends
- [ ] STOP, human handoff, consent, media and clinical escalation verified
- [ ] Outbound and delivery callbacks tested without touching existing business number
- [ ] Independent reviewer accepts exact source SHA and complete evidence

Do not claim integration complete before every applicable acceptance item passes.

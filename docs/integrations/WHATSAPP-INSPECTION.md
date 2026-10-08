# WhatsApp implementation inspection

Inspected current main `c705d2e` (fetched 7 October 2026). Read AGENTS and the three audit records. This is a targeted feature inspection, not a repeat full audit. The audited `9fb7276` -> current-main delta contains auth recovery, restricted tenant/session reads, bounded CRM/dashboard reads, branding, documentation and deployment-region changes. Preserve these changes and historical audit conclusions.

## Found and reusable

- `src/server/channels/provider.ts`, `registry.ts`, tenant-bound server credentials and external-effect policy.
- Meta text adapter, raw-body HMAC verification and webhook handshake.
- Canonical `channel_connections`, `conversations`, `messages`, `message_deliveries` and shared Inbox.
- CRM phone matching, provenance and append-oriented activity history.
- Restricted communication/automation DB roles, owner/staff RLS, same-tenant FKs.
- Durable inbound `message.received` events, correlation/depth/effect budgets and Automation runner.
- Approved business profile/services/FAQs/opening hours, booking domain, tenant-bound AI model registry.
- Settings and conversation server actions; PGlite security tests, Vitest and Playwright; protected-main Git/Preview workflow.

## Missing at inspection

Service-window guards, approved templates/consent, interactive/media normalization, bounded media retrieval, durable human control, a WhatsApp AI action, optional transcription seam, comprehensive webhook-route/AI acceptance tests and owner onboarding documentation.

## Conflicts found

- First-contact lookup could race concurrent deliveries and create extra CRM leads.
- Existing Customer without a source Lead caused an unnecessary new Lead.
- Delivery statuses were resolved by message ID without signed sender scoping.
- Free-form replies had no 24-hour service-window enforcement.
- Unsupported status types could invalidate an otherwise usable batch.
- Request size was checked after allocating the complete body.
- Existing documentation described a text-only integration as production-capable without accounting for templates/consent/handoff.

## Smallest safe implementation

Extend the existing adapter and restricted RPCs. Reuse the Automation queue for a per-tenant approved-knowledge assistant. Default AI off; retain immutable external-effect snapshots and duplicate-send suppression. Add handoff/consent/media metadata to canonical records. Reuse Settings and Inbox for owner/staff controls. Do not create parallel messaging/contact tables, modify the MVP/CIGO repositories, register any real phone number or invent Meta credentials.

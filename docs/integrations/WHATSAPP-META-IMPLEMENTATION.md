# Meta WhatsApp operational contract

## Architecture and routes

Domain services -> WhatsAppProvider -> Meta adapter. The existing canonical CRM/Inbox and durable Automation event `message.received` with `conversation.channel=whatsapp` are authoritative. No additional WhatsApp inbox or contact store exists.

- `/api/channels/whatsapp/meta/webhook`: GET handshake; POST exact-byte HMAC validation and bounded 512 KiB streaming read. Missing security returns 503; invalid signatures 401; malformed known payloads 400; unknown fields/message/status types are ignored. Storage failures return retryable 503.
- `/api/channels/whatsapp/meta/health`: configuration-only status; explicitly does not attest live delivery.
- `/api/channels/whatsapp/media/:messageId`: authenticated, tenant/actor-scoped private attachment download; no public media URL/token. Allowlisted Meta HTTPS hosts, no redirects, accepted MIME types and maximum 16 MiB streamed size.
- Existing `/api/internal/automation/run`: durable runner/recovery. A webhook schedules a bounded post-response drain using Next `after()`. Keep the established protected scheduler for backlog recovery; a post-response invocation is not a substitute for unattended scheduler monitoring. No unauthenticated runner is added.

## Secret placement

Use **Vercel -> codeedge-business-os-test -> Settings -> Environment Variables** for the controlled Preview and, only at the later approved live stage, the correct Production environment. Credentials never enter browser forms, source, GitHub, response bodies or structured logs. The project uses existing names rather than incompatible global token variables:

| Variable | Secure value/source |
| --- | --- |
| `COMMUNICATION_DATABASE_URL` | Existing restricted, TLS-verified communication LOGIN, not service-role/admin URL |
| `AUTOMATION_DATABASE_URL` | Existing restricted Automation LOGIN (current architecture may use communication connection fallback) |
| `AUTOMATION_RUNNER_SECRET` | Long random bearer secret for established scheduler |
| `WHATSAPP_META_APP_SECRET` | Meta app settings App Secret |
| `WHATSAPP_META_VERIFY_TOKEN` | Long random token shared only with Meta webhook verification settings |
| `WHATSAPP_META_GRAPH_API_VERSION` | Version explicitly supported/selected for the Meta app, e.g. `v25.0` only after verifying it in the app; no guessed default |
| `WHATSAPP_META_CREDENTIALS_JSON` | Server credential registry described below |
| `AI_MODEL_CREDENTIALS_JSON` | Existing per-workspace openai-compatible model credential registry |
| `WHATSAPP_TRANSCRIPTION_ENABLED` | `false` for initial launch; vendor-neutral optional seam needs a registered provider before enabling |

WhatsApp credential shape (placeholders only):

```json
{"codeedge_primary":{"businessId":"<workspace-uuid>","provider":"meta_whatsapp_cloud","environment":"production","externalSenderId":"<phone-number-id>","externalAccountId":"<waba-id>","secret":"<access-token>"}}
```

Phone/WABA IDs, display number and credential alias go in Settings -> WhatsApp. Tokens/App Secret stay in server environment. WABA template reads verify `externalAccountId` against credential metadata; sender credentials verify tenant/provider/environment/phone identity. A single deployment-wide app secret supports multiple tenant WABAs belonging to that Meta app. Separate Meta apps require separate verified webhook deployments or a separately reviewed per-app secret-routing extension; never select a signing secret from unsigned payload tenant data.

Codeedge already exists as an ordinary workspace. There is no Codeedge-only routing or hardcoded workspace identity. Its current demo mode remains intact; live effects cannot use demo credentials. Meta supports explicitly classified sandbox test-number credentials as well as production credentials. Workspace mode and tenant-bound credential environment must match; browser roles cannot change either classification. Automated tests inject synthetic transport/model providers, never real credentials. Demo always blocks external traffic, production blocks sandbox credentials and sandbox blocks production credentials.

## Durable policy

- Phone matching strips formatting from canonical international numbers. Local numbers without a country code are not guessed/merged. Advisory transaction locks serialize first-contact creation by tenant and canonical sender phone. Existing Customer records are linked without creating unnecessary Leads.
- Signed provider timestamp, not receipt/retry time, determines the 24-hour free-form window. No timestamp means no new window. Existing history is not assumed to establish a window. Duplicate receipt does not reopen it.
- Reused message IDs do not insert another message/event/CRM activity. Assistant claims are atomic per inbound canonical message; deterministic reply IDs are stable across different workflows.
- Templates require a Meta-refreshed APPROVED registry (maximum age one hour) and recorded explicit outbound consent. All templates, including utility, use this conservative consent rule. STOP/UNSUBSCRIBE/CANCEL/STOP ALL suppress every outbound send. An owner can record fresh consent with source evidence; resuming automation remains a separate explicit action.
- A customer asking for a person, media review, sensitive clinic request, low-confidence/failed AI, booking request or manual staff reply pauses AI. Control is stored in the DB. An epoch invalidates replies generated/prepared before takeover. Recheck actor/state/epoch/window/opt-out immediately before a network call. An already-in-flight provider call cannot be recalled; no subsequent automated call is authorized.
- AI facts come exclusively from active tenant FAQs/services/profile/hours. Exact approved FAQ answers do not require a model. The model selects a bounded approved answer index; output prose cannot invent facts. Unknown pricing falls back to staff unless an approved FAQ gives a price and currency. A bare starting-price amount without currency is not converted into an invented quote.
- Clinic mode supports administrative enquiries only. Medical or ambiguous non-administrative requests go to human review before a model is invoked. Prior clinical history is not sent to the selector; medical FAQ prose is excluded. No autonomous diagnosis, prescription, emergency decision or booking/payment write exists.
- Voice/media remain first-class inbound records and human-reviewed. Optional `TranscriptionProvider` is vendor-neutral, feature-flagged and disabled for clinic audio. Automatic transcription is not claimed or enabled; choose and implement a credentialed provider before activating it.

## Failure and recovery

Network sends use bounded timeouts and no automatic POST retries. Rate limiting/provider errors are safely classified; no provider body/secret is logged. Existing accepted-but-unpersisted sends remain ambiguous `sending` and are never blindly resent. AI failure preserves inbound CRM/Inbox data and hands off. Assistant claims conservatively prevent repeated model invocation even if a worker crashes; staff sees unresolved claimed outcomes and can take control. Structured logs allow only internal business/conversation/message IDs and safe codes.

Template support currently covers body text parameters; headers, media template components, authentication OTP templates and rich template buttons need a further reviewed domain contract. Meta may reject unsupported template shapes; failure stays visible. Interactive/media send operations exist in the provider contract; the current Inbox domain/UI dispatches text and approved body-text templates. Additional outbound composer modes must reuse the same DB guards/outbox.

## Migration and release

Migration created with Supabase CLI: `20261007190817_meta_whatsapp_automation.sql`. Additive columns/indexes, locked first-contact handling, restricted RPCs and one Automation system workflow per tenant. AI defaults off; zero live credentials are introduced. No RLS is disabled and browser roles cannot execute transport/assistant/media/consent RPCs or write template approval cache/control metadata.

Run `npm run schema:check`, lint/typecheck, full Vitest/security and production build. The real-service acceptance test covers signed inbound -> CRM -> Inbox -> queue -> approved AI -> synthetic Meta -> delivery -> human takeover -> no subsequent AI. This is synthetic evidence, not a Meta test-number or live-phone test.

Before any hosted mutation, follow the existing migration discipline: fresh verified recoverable backup, exact ledger/target preflight, restore/rehearsal, preserve other branches' schema, stop on drift/failure. Release through a focused PR and controlled immutable Preview before protected-main promotion. Live Meta tests, webhook subscription, number coexistence and billing remain owner/Meta gates. Existing WhatsApp Business app is never automatically altered.

## Official references checked

- [Meta official API collection](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta webhook payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)
- [Meta signing/handshake reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) (archived SDK used only as protocol reference, not a dependency)
- [Current Meta coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Meta Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions)

The current Meta developer pages returned HTTP 429 during automated retrieval. Do not infer account-specific coexistence eligibility or the newest version from secondary articles. Verify those in the owner's Meta app/official onboarding flow before entering the real number. Embedded signup is the intended coexistence path; eligibility, Tech Provider access and version rollout are account/Meta checks. Stop if Meta requests removal of the mobile-app account.

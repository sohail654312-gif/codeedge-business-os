# Integrations

The shell intentionally uses demo data first.

Planned adapter categories:

- Finance: ERP/accounting engine
- Communications: canonical Shared Inbox with replaceable channel providers
  - Website Chat: live
  - WhatsApp: Meta Cloud API adapter through the generic channel/delivery layer
  - Email: Resend adapter through the same generic channel/delivery layer
  - SMS: Twilio adapter through the same generic channel/delivery layer
- Automation: workflow engine
- Voice: real-time AI voice provider
- AI: LLM / business intelligence provider
- Google: Business Profile / analytics / search data
- Payments: payment provider

No integration should be described as working until it is configured and tested.


AI Voice remains a later provider. It should plug into the same canonical Conversation + Message core and the replaceable external communication boundary rather than creating a separate CRM or inbox.


Email remains a provider-replaceable channel. Its Resend adapter feeds the same canonical Conversation + Message core, Shared Inbox and CRM used by Website Chat and WhatsApp. See `docs/email.md`.

SMS remains provider-replaceable. Twilio is the first production adapter; inbound/outbound SMS and delivery callbacks feed the same Conversation + Message core, Shared Inbox and CRM. See `docs/sms.md`.


## Execution safety

External communication providers are now gated by the server-side Codeedge execution context and fail-closed external-effect policy. Existing workspaces and connections remain `production` by default. Demo workspaces cannot reach live provider adapters, and Sandbox workspaces cannot use production credential environments. See `docs/communication-core-execution-safety.md`.

# Integrations

The shell intentionally uses demo data first.

Planned adapter categories:

- Finance: ERP/accounting engine
- Communications: canonical Shared Inbox with replaceable channel providers
  - Website Chat: live
  - WhatsApp: Meta Cloud API adapter through the generic channel/delivery layer
  - Email: Resend adapter through the same generic channel/delivery layer
  - SMS: reserved
- Automation: workflow engine
- Voice: real-time AI voice provider
- AI: LLM / business intelligence provider
- Google: Business Profile / analytics / search data
- Payments: payment provider

No integration should be described as working until it is configured and tested.


AI Voice remains a later provider. It should plug into the same canonical Conversation + Message core and the replaceable external communication boundary rather than creating a separate CRM or inbox.


Email remains a provider-replaceable channel. Its Resend adapter feeds the same canonical Conversation + Message core, Shared Inbox and CRM used by Website Chat and WhatsApp. See `docs/email.md`.

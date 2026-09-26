# Codeedge Business OS

**One Business. One Account. One Control Centre.**

Codeedge Business OS is the active Codeedge SaaS product. It unifies customer operations, communications, booking, automation, AI voice, finance and AI-assisted finance behind one tenant-aware workspace.

The older repository `sohail654312-gif/codeedge` is a protected read-only reference for proven MVP patterns. It is not the active product repository and is not modified by Business OS development.

## Current V1

Current implemented product areas include:

- authenticated workspaces, memberships, roles and tenant isolation
- CRM Leads, Customers, conversion, notes, quote requests and activity history
- Business Profile, Services, service areas, opening hours, FAQs and settings
- Conversations / Shared Inbox
- Website Chat
- WhatsApp, Email and SMS channel foundations
- Booking / Appointments
- AI Voice / AI Receptionist, including zero-live-telephony Demo behavior
- Automation Engine with Demo dry-run safety
- Demo / Sandbox / Production execution modes and the External Effect Policy
- Codeedge Money and the Finance Engine Interface
- Demo Finance Engine and ERPNext Finance adapter
- AI Accountant with grounded Finance context and human-approved actions
- Command Centre views backed by Codeedge operational data

See [docs/architecture.md](docs/architecture.md) for the authoritative central architecture and [docs/v1-feature-completeness.md](docs/v1-feature-completeness.md) for V1 scope.

## Development

Node.js 22 is used in CI.

```bash
npm ci
npm run schema:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`package-lock.json` is authoritative for npm dependency resolution. CI uses `npm ci`; dependency upgrades are deliberate review changes rather than incidental installs.

## Database boundaries

Browser/application data access uses the Supabase application client with RLS and tenant-scoped authorization.

Sensitive server-side domains use restricted PostgreSQL capability roles through the neutral `src/server/db/restricted-capability.ts` boundary. Communication, Website Chat, Voice, Automation, Finance and AI retain separate database roles and cannot acquire each other's capabilities merely by sharing connection infrastructure.

Repository migrations under `supabase/migrations/` are authoritative. CI checks a deterministic generated TypeScript schema-contract snapshot so migration/type drift cannot pass silently.

## External providers

Provider integrations follow:

```text
Codeedge Domain -> Provider Interface -> Replaceable Adapter
```

External effects are additionally constrained by workspace execution mode, provider credential environment and the External Effect Policy. Demo paths must not trigger live provider traffic.

## Current vs future

Current V1 functionality is described in the architecture and feature-completeness documents. Deferred work is explicitly labelled there. Jarvis, generalized AI Employees, payroll, Open Banking, payment processing, a Codeedge-native production ledger and major product redesign are not represented as current capabilities.

## Audit remediation

Production hardening is tracked separately from feature completeness. Audit remediation records live under `audit-remediation/`; historical audit evidence must not be overwritten.

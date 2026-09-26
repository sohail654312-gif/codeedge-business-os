# Codeedge Business OS - architecture

## 1. Product boundary

**Codeedge Business OS is the product.** The customer signs in to a Codeedge workspace and uses Codeedge-owned workflows, permissions, normalized domain services and user experience.

The protected historical MVP repository (`sohail654312-gif/codeedge`) is read-only reference material. It can inform proven security and validation patterns, but it does not replace the Business OS architecture.

## 2. Tenant, authentication and session model

Supabase Auth provides application identity. Server-side session helpers verify the authenticated user and require a confirmed account before protected workspace access.

Every active workspace is a Codeedge business/tenant. Memberships bind a user to a business with an explicit role. Server-side authorization resolves the active membership and business before domain operations run. Tenant-owned records carry a business identifier and application queries remain tenant-scoped.

PostgreSQL Row Level Security is the database enforcement layer for browser/application-accessible tenant data. RLS complements, rather than replaces, server-side tenant checks.

## 3. Dual data-access architecture

Codeedge intentionally has two database access paths with different privilege models.

### Supabase application access

The normal application client uses Supabase authentication, publishable client credentials and RLS. This path serves authenticated workspace operations such as CRM and other tenant-facing data.

### Restricted server-side PostgreSQL capabilities

Sensitive internal services use server-only PostgreSQL connections through the domain-neutral restricted capability infrastructure in `src/server/db/`.

The shared infrastructure owns only generic mechanics:

- PostgreSQL URL and verified-TLS validation
- bounded pool creation and connection timeouts
- BEGIN / COMMIT / ROLLBACK and cleanup
- statement, lock and idle-transaction timeouts
- restricted role switching

Privileges remain domain-specific. Current capability roles include:

- `codeedge_communication_api`
- `codeedge_chat_api`
- `codeedge_voice_api`
- `codeedge_automation_api`
- `codeedge_finance_api`
- `codeedge_ai_api`

Sharing infrastructure does **not** create a super-role and does not merge privileges between domains.

## 4. Current application domains

### CRM and business information

The current CRM includes Leads, Customers, Lead-to-Customer conversion, activity history, notes, quote requests, search/filter flows and tenant-scoped customer records.

Business information includes Business Profile, Services, service areas, opening hours, FAQs, settings and business timezone.

### Conversations and communication channels

The Shared Inbox is built on Codeedge Conversation and Message records. Current channel surfaces include Website Chat, WhatsApp, Email and SMS.

Provider-specific delivery logic stays behind channel/provider boundaries. Demo behavior and tests do not send real provider traffic.

### Booking

Booking/Appointments supports availability and create, confirm, reschedule and cancel journeys using the configured business timezone.

### AI Voice / AI Receptionist

Voice uses a provider-neutral Voice interface and replaceable adapters. Current adapters include internal Demo Voice and Vapi. Demo Receptionist creates Codeedge-side Lead/Conversation/Transcript/Booking behavior without live telephony.

### Automation Engine

The Automation Engine owns trigger, condition and action evaluation, run/action history, deterministic request identity and retry classifications. In Demo mode, actions that would cause an external effect are recorded as simulated/dry-run rather than sent to a provider.

### External Effect Policy and execution modes

Each workspace has an execution mode: **Demo**, **Sandbox** or **Production**. External actions are checked against the execution mode and provider credential environment. Demo cannot emit live external effects; Sandbox cannot use Production credentials; Production cannot use Sandbox credentials.

### Codeedge Money and Finance

The Finance architecture is:

```text
Codeedge Money
  -> Codeedge Finance Domain / UX
  -> Finance Engine Interface
  -> Finance Engine Registry
      -> Demo Finance Engine
      -> ERPNext Adapter
      -> future replaceable engines
```

Codeedge owns normalized Finance contracts, tenant context, orchestration, execution safety, audit/execution records and customer-facing Money UX.

The Demo Finance Engine supports the deterministic V1 Money journey and reporting simulation. It is not represented as a production ledger.

The ERPNext adapter is a replaceable external Finance engine. Current ERPNext capabilities are limited to the capabilities declared by its authoritative provider metadata; unsupported operations fail closed rather than being fabricated.

### AI Accountant

AI Accountant uses Codeedge Finance context and a provider-neutral AI boundary. Current behavior supports grounded Finance evidence and human-approved action proposals. Approval and Finance execution remain separate; AI does not bypass Finance services or the External Effect Policy.

## 5. Provider-neutral adapter architecture

Replaceable providers follow:

```text
Codeedge Domain -> Provider Interface -> Adapter
```

Authoritative provider metadata defines supported environments, external-effect classification and capabilities. Concrete Finance and Voice adapters derive their metadata/capability sets from that source so registry declarations cannot silently diverge from runtime behavior.

Unknown providers, unsupported environments and unavailable capabilities fail closed.

## 6. Database schema contract

Repository migrations in `supabase/migrations/` are authoritative.

CI deterministically derives a checked-in TypeScript schema-contract snapshot from the ordered migrations and the application Database type surface. CI fails when that generated contract is stale or when application Database types reference schema objects that the migrations do not define.

Production Supabase is not used as an uncontrolled schema source of truth.

## 7. Current architectural boundaries

- Codeedge domain services remain the business-logic boundary.
- RLS and explicit server-side tenant checks are both required.
- Restricted database capability roles remain separate.
- Raw provider secrets remain server-only.
- Demo/Sandbox/Production safety is enforced before live effects.
- Provider adapters are replaceable and may not redefine the Codeedge domain.
- CI and deterministic repository artifacts define build/dependency/schema reproducibility.
- The protected MVP remains read-only.

## 8. Deferred / future work

The following are **not current V1 capabilities** and must not be described as implemented:

- Jarvis
- generalized AI Sales or Support Employees
- payroll
- Open Banking
- payment processing
- a Codeedge-native production accounting ledger
- arbitrary additional provider engines
- enterprise-grade wait/scheduling workflow nodes
- major product redesign

Future capabilities should be added behind existing Codeedge domain and provider boundaries rather than replacing them.

# Codeedge Money / Finance Core

Codeedge Money is the customer-facing finance product. Finance engines are replaceable execution providers.

```text
Codeedge Money
  -> Codeedge Finance Domain / UX
  -> Finance Engine Interface
  -> Finance Engine Registry
     -> Demo Finance Engine
     -> ERPNext Adapter
     -> future Codeedge-native engine
     -> future external engines
```

## Ownership boundary

Codeedge owns tenant identity, permissions, normalized finance contracts, orchestration, execution-mode safety, audit records, Automation events, Finance UX and engine selection.

The selected Finance Engine owns accounting execution, engine-native posting rules and engine-native accounting records.

Codeedge does not maintain a second production double-entry ledger beside ERPNext.

## Money and currency

Finance API boundaries use validated decimal strings such as `"123.45"`. Codeedge Demo calculations convert those strings to integer minor units using `BigInt`; JavaScript floating-point arithmetic is not authoritative accounting math.

Each Finance connection has an explicit three-letter default currency. Documents also carry currency explicitly. Mixed-currency Demo reporting fails closed instead of silently adding unlike currencies.

## Finance connections

`finance_connections` is tenant-owned and force-RLS protected.

A connection stores:

- business ID
- engine
- enabled state
- external account/company reference
- opaque credential key
- credential environment
- explicit default currency
- safe provider metadata

Raw ERPNext API credentials are never stored in browser-readable tables.

ERPNext connection keys resolve through server-only `FINANCE_ERPNEXT_CREDENTIALS_JSON`. Provider URLs come from that trusted server configuration; the browser cannot submit an arbitrary authenticated fetch URL.

## Execution safety and audit

Every finance write obtains a `finance_execution_records` entry before execution.

The record stores safe metadata including business, actor, engine, operation, Codeedge reference, execution mode, credential environment, correlation ID, request ID and terminal status.

For external engines, Codeedge re-checks current execution mode and current credential environment immediately before the provider call through the existing central External Effect Policy.

A Demo workspace cannot perform a live ERPNext write. Sandbox cannot use Production credentials. Production cannot use Sandbox credentials.

Repeated request IDs do not create a second execution. Ambiguous external completion is not automatically retried.

## Demo Finance Engine

The permanent Demo Finance Engine is an internal simulation engine available only when the workspace itself is in Demo mode and the active Finance connection is `demo_finance`.

It supports:

- CRM customer mapping
- suppliers
- quotations
- invoices
- simulated accounting payments
- bills
- expenses
- Money dashboard metrics
- read-only Chart of Accounts
- read-only General Ledger
- read-only Trial Balance
- deterministic P&L
- deterministic Balance Sheet
- deterministic Cash Flow

Its data lives in `demo_finance_documents`, which is not browser-readable and is not a production accounting ledger.

The owner explicitly selects the Demo currency before seeding the deterministic Demo Money journey.

## ERPNext consolidation

The historical `src/integrations/erpnext/*` client remains for compatibility and smoke tooling, but the new production Money path uses the `FinanceEngine` contract.

ERPNext errors are normalized. Provider response bodies and internal Frappe diagnostics are not propagated to users.

Legacy ERPNext Customers, Quotations, Invoices and Status API routes are now authenticated compatibility wrappers over Codeedge Finance. The old ERPNext Leads endpoint is retired because Leads belong to canonical Codeedge CRM.

Lead-to-Customer conversion maps the canonical Codeedge Customer through Finance rather than calling a global ERPNext adapter directly.

Current ERPNext Finance capabilities are intentionally limited to:

- health
- customers
- suppliers
- quotations
- invoices

Unsupported writes/reports are reported as unavailable rather than fabricated.

## Automation events

Successful or safely simulated Finance executions emit stable events:

- `finance.quote.created`
- `finance.invoice.created`
- `finance.payment.recorded`
- `finance.bill.created`
- `finance.expense.created`

These events flow through the existing Codeedge Automation Engine.

## UI

Customer-facing navigation is **Money**, not ERPNext.

Initial pages:

- Money Overview
- Sales
- Purchases
- Accounting
- Reports

Accounting and report views are read-only. Unsupported engine capabilities render as unavailable.

## Deferred

This Finance Core does not implement:

- AI Accountant
- autonomous journal posting
- tax filing
- payroll
- live banking/Open Banking
- payment processing
- full FX accounting
- manual production journal editing
- a Codeedge-native production ledger

Those capabilities can be added later without replacing the Finance domain boundary.

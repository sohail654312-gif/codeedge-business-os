# ERPNext integration

## Purpose

ERPNext is the first external engine connected to the CodeEdge Business OS architecture.

CodeEdge remains the customer-facing SaaS. ERPNext is treated as a replaceable back-office provider.

## Why ERPNext

ERPNext already provides mature business functionality such as accounting, sales invoices, customers, suppliers, orders, quotations, projects, tasks and other operational records.

ERPNext is built on the Frappe Framework, which provides authentication, role-based permissions and generated REST APIs.

## API strategy

CodeEdge uses the Frappe REST API instead of copying ERPNext into the CodeEdge repository.

Initial endpoints:

- `GET /api/method/frappe.auth.get_logged_user`
- `GET /api/resource/Customer`
- `GET /api/resource/Lead`
- `GET /api/resource/Quotation`
- `GET /api/resource/Sales Invoice`

Frappe also provides API v2 on supported modern versions. The adapter can migrate internally later without changing CodeEdge screens.

## Authentication

Server-side token authentication:

`Authorization: token <api_key>:<api_secret>`

Never expose either credential to client-side code.

## Environment variables

```text
ERPNEXT_BASE_URL=https://your-erpnext-instance.example
ERPNEXT_API_KEY=
ERPNEXT_API_SECRET=
```

## Initial CodeEdge mapping

| CodeEdge | ERPNext |
|---|---|
| CRM customer | Customer |
| CRM lead | Lead |
| Quote | Quotation |
| Invoice | Sales Invoice |
| Payment | Payment Entry |
| Supplier | Supplier |
| Supplier bill | Purchase Invoice |
| Project | Project |
| Task | Task |
| Employee | Employee |

## Current state

The adapter and health/status endpoint are prepared.

A real ERPNext instance and API credentials are still required before this can be called a live integration.


## Codeedge Money consolidation

The original ERPNext adapter predates the permanent Finance Engine architecture.

New production finance flows must go through:

```text
Codeedge Money -> Finance Domain -> Finance Engine Registry -> ERPNext Adapter
```

The historical adapter exports and smoke tooling remain compatibility surfaces only. They must not become a second customer-facing Finance API.

Tenant-specific production credentials should use opaque Finance connection keys resolved through server-side Finance credential configuration. The original global `ERPNEXT_*` variables remain legacy/dev compatibility configuration and are not the final multi-tenant Money credential model.

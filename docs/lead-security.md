# Lead persistence and tenant boundary

This phase establishes the database security boundary required before CodeEdge
Business OS enables real Lead create/update UI.

The protected CodeEdge MVP was used only as a read-only reference. Business OS has
its own migration and tests and does not import source code from the MVP repository.

## Tenant model

Every persisted Lead belongs to one `business_id`. Access is derived from the
authenticated database identity plus a live `business_memberships` row.

A URL, hidden form field, browser-supplied tenant ID, or role claim is never enough
to grant access.

The database enforces:

- active business
- active membership
- owner/staff role
- RLS on businesses, memberships, services and Leads
- owner-only Lead deletion
- owner/staff Lead read/create/update
- server identity must match `created_by` on insert
- immutable tenant/creator columns through column-level grants
- tenant-qualified Lead-to-Service foreign keys

## Current scope

This is a persistence/security foundation only. It is not yet connected to the
visible Leads pages.

Real authentication/session wiring and server actions must be added before Add Lead
or Edit Lead is enabled.

The migration is verified in CI-compatible unit/security tests using a fresh
PostgreSQL-compatible PGlite database with unprivileged `anon` and
`authenticated` roles. A later deployment step must also verify the migration
against the selected hosted Supabase/PostgreSQL environment before production.

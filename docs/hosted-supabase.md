# Hosted Supabase baseline

CodeEdge Business OS now has a dedicated hosted Supabase project for the SaaS core.

Project reference:

`ljniurodhvbvpcztwlnh`

Region:

`ap-south-1`

Applied database migrations:

1. `tenant_leads`
2. `leads_created_by_index`

The hosted schema currently contains:

- `businesses`
- `business_memberships`
- `services`
- `leads`

All four tenant-owned application tables have Row Level Security enabled.

## Runtime application settings

The application expects these runtime variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The project URL and publishable key are environment-specific deployment settings and are intentionally not committed into source control.

## Provisioning rule

Do not insert rows directly into `auth.users` from application SQL.

A user must first exist through Supabase Auth. Only then should a trusted provisioning path create:

1. a CodeEdge business
2. an owner membership linking that authenticated user to the business

The browser must never be allowed to self-assign an owner role or membership.

## Current status

The hosted database foundation is live and security-advisor clean.

A real test Owner account is still required before the application can perform an end-to-end authenticated login against the hosted project.

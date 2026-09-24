# Runtime authentication and tenant guard

This phase connects CodeEdge Business OS to Supabase Auth and makes the dashboard
fail closed unless a verified user has an active membership in an active business.

The protected CodeEdge MVP was used only as a read-only reference. Business OS has
its own implementation and no runtime dependency on the MVP repository.

## Request path

Protected dashboard requests now follow:

1. Supabase session cookie
2. Supabase `auth.getUser()` verification
3. verified email check
4. live `business_memberships` lookup
5. active business check
6. role derivation from the database
7. dashboard render

The browser cannot grant access by supplying a business ID, role, or user metadata.

## Runtime pieces

- `src/middleware.ts` refreshes Supabase SSR session cookies when Supabase is configured.
- `src/server/db/client.ts` creates the server-only Supabase client.
- `src/server/authorization/tenant.ts` contains identity and tenant authorization.
- `src/server/auth/session.ts` converts authorization failures into login/not-found page behavior.
- `src/modules/auth/actions.ts` performs password sign-in and local sign-out.
- `src/app/dashboard/layout.tsx` protects every dashboard route.

## Multi-business behavior

The current dashboard resolves the oldest active membership as the default business.
That is an authorization-safe default, not the final workspace-switcher experience.
A future workspace switcher must still call `requireTenant` before selecting a
different business.

## Configuration

Required at runtime:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Only publishable/anon Supabase keys are accepted by the runtime environment parser.
Secret/service-role keys must never be exposed through public environment variables.

## Current limits

This phase does not provision Supabase users or business memberships and does not
deploy the migration to a hosted Supabase project. Until a real project is
configured and the migration is applied, the login screen cannot authenticate a
real user.

The existing ERPNext integration routes still use the current demo/global adapter
configuration. They must be explicitly tenant-bound before a multi-tenant production
deployment. That work is separate from the Leads authentication guard.

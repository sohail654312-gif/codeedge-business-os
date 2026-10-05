# Final staging acceptance — 5 October 2026

This record extends the historical Audit 1/2 closures. It does not authorize a
production promotion or claim that every Audit 3/4 business-policy gate is closed.

## Verified staging baseline

- Source: `9fb7276ab81b2da373e0e152f2086113aad732b0` on PR #75.
- Exact-SHA CI: Actions run `37267741714`, success: 712 tests, 323 security
  tests, four Playwright cases, schema contract/drift, lint, typecheck and build.
  One integration test is gated on the separate disposable ERPNext service;
  disposable ERPNext runs `37267741709` and `37267738626` succeeded.
- Dedicated Vercel test Preview: `dpl_4L9rKa9kamwatTqFKVdC1UpioSTy`, READY,
  `https://codeedge-business-os-test-6yrbmbzpi-codeedge.vercel.app`.
- Readiness: HTTP 200, `{"status":"ready","configured":6,"required":6}`.
- Runtime automation health and POST `run?probe=1`: HTTP 200, healthy, all queue
  counts zero. Unauthorized health access: HTTP 401. No runs claimed.
- Six deployed domains: Supavisor transaction pooling, `poolMax=3` each.
  Six separate LOGIN principals passed verified TLS and capability attestation;
  NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS.
  Server-only URLs are branch-scoped Sensitive Vercel Preview variables. The
  provider root CA is retained without disabling chain or hostname verification.
- Error/fatal runtime-log query returned no matching entries after these probes.

## Hosted database and recovery

Only Supabase `kffcywicqrtxdwgyvhvk` (`codeedge-business-os-test`) was changed.
The live ledger initially contained 27 original timestamp-named entries. After
recovery proof and delta rehearsal, the four missing migrations were applied in
order: audit2 security, audit4 automation reliability, conversion Won, and CRM
directory pagination. Actual parity is now **31/31**, with **40/40** public tables
RLS enabled and forced. Original ledger rows were preserved.

The hosted parity script now accepts both CLI suffix names and original
timestamp names, rejects missing/unexpected/duplicate identities, and supports
the verified provider CA. Its live execution returned `Hosted migration parity
verified (31/31)`.

Before hosted application, a consistent exported snapshot captured a native
PostgreSQL custom full dump plus an application/Auth/Storage dump and all 75 base
table counts. Native PostgreSQL 17.11 restored the latter into an isolated
loopback-only cluster. All 75 counts, the 27-row source ledger, and six logical
schema fingerprints matched. Logical column order is normalized because dump
restore compacts dropped physical column slots in managed Auth tables.

The restored database accepted all four deltas. Nine rollback-only tenant cases
passed there and on actual hosted staging: owner/staff Customer creation/editing,
cross-tenant invisibility, forged business/actor rejection, revoked and anonymous
denial, 261-row bounded pagination, and atomic/idempotent conversion. No provider
effects were generated.

Full/scoped dumps and role metadata without passwords were encrypted with
Windows DPAPI CurrentUser; every encryption round trip matched its plaintext
SHA-256. The full dump hash is
`1f317c89084de7221426cbb91834f04f23cc73638344624b43ace3966ff8906c`.
Recovery requires this Windows account. This is a measured local recovery proof,
not an independent offsite backup or recurring retention/RPO/RTO approval. Cloud
project settings, extension infrastructure, provider secrets and role passwords
are outside the scoped restoration proof. The Free project has no managed
backups; durable backup destination and policy remain owner decisions.

After the hosted deltas, six logical fingerprints (columns, indexes, policies,
triggers, functions and RLS) exactly match the rehearsed native database. A
separate constraint comparison found only three formatting differences: restored
PostgreSQL flattens redundant grouping of the two length predicates joined by
AND in locale/sender/inbound-email checks. Exact regrouped text and 14 boundary
cases per constraint match on both databases. Raw constraint digests are retained
as different; no unexplained definition differences were accepted.

## Additional candidate verification

`tests/integration/finance-ambiguity-rehearsal.test.ts` runs the actual Finance
service, engine and HTTP client against a loopback test adapter and a disposable
database with all migrations. Only the connection transport is substituted.
The adapter accepts one Customer write and destroys its response socket.
Codeedge persists `ambiguous`, a repeated request produces no second provider
write, the owner can read the reconciliation row, and another tenant cannot.
Operator read-back identifies the accepted provider Customer using the canonical
CRM reference. The record remains ambiguous for explicit operator review;
read-back does not silently resolve or replay it. No live provider is used.

The previously missing application account-recovery flow is added to support
test-owner acceptance. It uses Supabase's default PKCE email template, HttpOnly
verifier/session cookies, a fixed configured callback and verified-user password
updates. The user requests the email and enters the new password. Default PKCE
links must be opened in the browser that requested them. Malformed, expired,
consumed and invalid-verifier callbacks fail closed; arbitrary `next` or request
host values cannot change the destination. No privileged Auth key is added.
The dedicated test Site URL is the remediation branch alias, with only its exact
`/auth/confirm` endpoint added to the redirect allowlist. Production Auth settings
and email templates are untouched. Configured custom SMTP can later support a
token-hash template; the callback also supports bounded recovery token hashes.

## Remaining acceptance gates

- Exact-SHA CI and hosted acceptance of the additional recovery/parity/rehearsal
candidate must finish; baseline evidence above is not automatically attributed
  to a later commit.
- Test owner must recover/sign in before actual authenticated browser acceptance.
- Test-only rollback routing rehearsal must use a qualified immutable baseline.
- Alert destination/delivery and approved scheduler cadence remain operational
  gates; manual liveness does not prove an unattended scheduler.
- Owner must approve durable backup RPO/RTO and retention/archive policy.
- Controlled Voice provider/tool-loop acceptance still needs an approved test
  provider configuration. Demo behavior does not prove a live tool loop.

PR #75 remains draft; protected main is unchanged. Readiness alone is not V1 closure.

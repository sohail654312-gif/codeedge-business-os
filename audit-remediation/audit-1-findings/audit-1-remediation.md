# Codeedge Business OS - Audit 1 Technical & Architecture remediation

## Scope and baseline

Starting main SHA: `5be0269a6df961c965194dc06f61f9ef51ef9a2e`

Starting main CI: run #722 - GREEN

Remediation branch: `remediation/audit-1-technical-architecture`

The original Audit 1 baseline was older than the remediation baseline, so every finding was re-inspected against current main before changes were made. The protected MVP repository was not modified. The old hosted Supabase project was not modified. No production provider traffic was triggered.

## A1-01 - HIGH - main branch has no required CI / protection gate

**Status before remediation:** OPEN.

**Current evidence:** GitHub now reports `main` as protected by active repository ruleset `Protect main` (ruleset 24045183).

**Root cause:** repository governance was not configured to make CI a merge prerequisite.

**Files/services affected:** GitHub repository governance only; no application source change can substitute for this control.

**Fix implemented:** repository ruleset `Protect main` was created and activated for the default branch. It requires pull requests, requires the GitHub Actions `build` status check, requires the branch to be up to date, blocks deletion and non-fast-forward/force pushes, has no bypass actors, and reports the current user as unable to bypass.

**Security/tenant implications:** no tenant/RLS behavior changed. The repository governance path now makes the protected PR + required CI path authoritative for `main`.

**Verification evidence:** live ruleset read confirms enforcement `active`, required `build` from GitHub Actions, strict required-status policy, pull-request requirement, deletion/non-fast-forward blocking, empty bypass list, and `current_user_can_bypass: never`. GitHub branch state reports `main` as protected. A destructive force-push/direct-push test was intentionally not performed.

**Final status:** VERIFIED.

## A1-02 - MODERATE - dependency installation is not reproducible

**Status before remediation:** OPEN.

**Current evidence:** current main had no `package-lock.json`; CI and ERPNext smoke used `npm install`.

**Root cause:** dependency resolution was permitted to vary across clean installs.

**Files/services affected:** `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/erpnext-smoke.yml`.

**Fix implemented:** generated and committed an npm lockfile with Next.js intentionally pinned to 15.5.26; CI and smoke workflows now use `npm ci`; no unrelated dependency upgrade or force audit fix was introduced.

**Security/tenant implications:** improves supply-chain repeatability without changing tenant privileges.

**Tests/verification:** the lockfile was generated successfully in GitHub Actions using Node 22. Full deterministic install, lint, typecheck, test, build and E2E verification is required from the remediation PR CI.

**Final status:** VERIFIED — CI #738 passed deterministic install, schema checks, lint, typecheck, unit/security tests, production build and Playwright E2E.

## A1-03 - MODERATE - central architecture documentation is stale

**Status before remediation:** OPEN.

**Current evidence:** current `README.md` and `docs/architecture.md` still described an early foundation/future direction and omitted major V1 domains.

**Root cause:** central documentation did not evolve with the implemented product.

**Files/services affected:** `README.md`, `docs/architecture.md`.

**Fix implemented:** central documentation now describes the Business OS product boundary, auth/session, tenant/RLS model, dual data-access architecture, restricted server roles, CRM, Shared Inbox, Website Chat, WhatsApp, Email, SMS, Booking, Voice/Receptionist, Automation, External Effect Policy, execution modes, provider-neutral adapters, Codeedge Money, Finance Engine Interface, Demo Finance, ERPNext, AI Accountant, protected MVP relationship and architectural boundaries. Deferred work is explicitly separated from current V1.

**Security/tenant implications:** documentation now reflects rather than weakens the existing security model.

**Tests/verification:** documentation was cross-checked against current V1 feature-completeness and current source boundaries. Final PR review/CI remains required.

**Final status:** VERIFIED — central architecture documentation was cross-checked against current V1/source boundaries and CI #738 is GREEN.

## A1-04 - MODERATE - restricted DB capability infrastructure duplicated/cross-coupled

**Status before remediation:** OPEN.

**Current evidence:** Voice, Automation and Finance imported generic connection validation from `src/server/channels/capability.ts`; Website Chat repeated similar TLS/pool/transaction code; AI repeated the same pattern.

**Root cause:** generic database mechanics grew inside domain modules instead of a neutral server/database boundary.

**Files/services affected:** `src/server/db/restricted-capability.ts` and Communication, Website Chat, Voice, Automation, Finance and AI capability modules.

**Fix implemented:** introduced one domain-neutral restricted capability implementation for verified-TLS connection validation, bounded pool creation, transaction lifecycle, role switching and timeout policy. Each domain still declares its own role, connection source and timeout policy. No super-role was created.

**Security/tenant implications:** privilege isolation remains domain-specific: communication, chat, voice, automation, finance and AI roles remain separate and fail closed.

**Tests added:** `tests/unit/restricted-capability.test.ts` proves verified TLS fail-closed behavior, exact domain role separation, bounded pools, COMMIT path, ROLLBACK on failure and broken-client discard after rollback failure.

**Final status:** VERIFIED — CI #738 passed deterministic install, schema checks, lint, typecheck, unit/security tests, production build and Playwright E2E.

## A1-05 - MODERATE - ERPNext smoke workflow is stale

**Status before remediation:** OPEN.

**Current evidence:** the prior workflow supplied legacy `ERPNEXT_*` environment variables and expected obsolete/unauthenticated compatibility-route responses.

**Root cause:** the smoke test was not migrated when ERPNext moved behind Codeedge Money and the Finance Engine interface.

**Files/services affected:** `.github/workflows/erpnext-smoke.yml`, `tests/integration/erpnext-finance-smoke.test.ts`, Finance status response mapper/route.

**Fix implemented:** the workflow now starts only a disposable local ERPNext instance, creates its deterministic provider fixture before credential generation, generates and commits a disposable ERPNext API credential, clears the disposable site cache, restarts the disposable backend and frontend together so the proxy and credential state are synchronized, verifies token authentication, then binds credentials through `FINANCE_ERPNEXT_CREDENTIALS_JSON` to a deterministic Codeedge test business and exercises the current Finance registry/engine/credential boundary. The current HTTP status response shape is produced by a shared Finance status mapper and asserted in the smoke. Relevant Finance/ERPNext PRs trigger this targeted smoke automatically; no production provider credentials or traffic are used.

**Coverage boundary:** application sign-in/RLS/tenant wiring is validated by the main security and critical-path suites. The disposable provider smoke does not fake an unauthenticated Codeedge API request.

**Verification evidence:** smoke runs #17-#19 exposed a disposable Frappe credential/proxy propagation race rather than a Codeedge Finance boundary defect. The workflow was stabilized by ordering fixture creation before credential generation and coordinating cache activation with backend+frontend restart. ERPNext disposable Finance Engine smoke #20 then completed GREEN twice on the same remediation head, including deterministic install, disposable ERPNext startup, fixture creation, committed API credential generation, credential activation, token authentication, current Finance Engine boundary execution and cleanup.

**Final status:** VERIFIED — ERPNext disposable Finance Engine smoke #23 passed on synchronized remediation head `65ff2e5613e7008ad0f6f9fa50567c06231feaf9`, including disposable startup, fixture/credential creation, token authentication, current Finance boundary execution and cleanup.

## A1-06 - MODERATE - system-level E2E coverage is too thin

**Status before remediation:** PARTIALLY FIXED. Current main already had browser E2E for Website Chat and AI Accountant but not the requested V1 critical-path set.

**Root cause:** product breadth grew faster than a deliberately small cross-domain system suite.

**Files/services affected:** `src/app/e2e-harness/business-os/`, `tests/e2e/business-os-critical-paths.spec.ts`, existing Website Chat/AI Accountant E2E remains unchanged.

**Fix implemented:** added one deterministic test-only Business OS harness and one consolidated browser test covering owner sign-in/session, isolated workspace denial, Lead creation to Customer conversion, Booking, safe communication, Automation Demo dry-run, Demo Voice/Receptionist and Demo Money. The harness is disabled unless `CODEEDGE_E2E_HARNESS=1`.

**Security/tenant implications:** the suite explicitly verifies cross-workspace denial and zero external-provider effects. Existing PGlite security tests continue to exercise migrations/RLS; the browser harness validates browser -> server action -> auth/tenant -> service/domain -> test persistence wiring without live provider traffic.

**Final status:** VERIFIED — CI #738 Playwright E2E is GREEN, including the consolidated Business OS critical-path suite.

## A1-07 - MODERATE - no database schema <-> TypeScript contract drift gate

**Status before remediation:** OPEN.

**Current evidence:** `src/types/database.ts` was manually maintained and current CI had no migration/type correspondence check.

**Root cause:** migrations and application database types could change independently without a deterministic review gate.

**Files/services affected:** `scripts/generate-schema-contract.mjs`, `src/types/database-contract.generated.ts`, `package.json`, CI.

**Fix implemented:** ordered repository migrations remain authoritative. A deterministic generator hashes and extracts migration tables/functions/enums, extracts the application Database type surface, rejects TypeScript references to nonexistent migration objects, and emits a checked-in TypeScript contract snapshot. CI fails when that snapshot is stale. The generator also has a deliberate mismatch proof command.

**Verification evidence:** the first bootstrap correctly failed on an over-broad parser; the parser was corrected and the subsequent bootstrap run succeeded, generating migration digest `87137fbb04db270839ba5a5f10283131367aa6c205f020617e987ede5f253857`. CI #738 passed both `schema:check` and `schema:prove-drift`, including the deliberate mismatch proof.

**Final status:** VERIFIED — CI #738 passed deterministic install, schema checks, lint, typecheck, unit/security tests, production build and Playwright E2E.

## A1-08 - LOW - provider capability metadata duplicated

**Status before remediation:** OPEN.

**Current evidence:** Finance registry metadata and concrete engine capability sets duplicated one another; Voice registry metadata duplicated adapter metadata.

**Root cause:** provider metadata had more than one source of truth.

**Files/services affected:** Finance/Voice provider metadata, registries and adapters.

**Fix implemented:** introduced authoritative Finance and Voice provider metadata modules. Registries expose that metadata and concrete adapters derive their capability/metadata declarations from it. Domain -> Provider Interface -> Replaceable Adapter remains unchanged.

**Security/tenant implications:** unknown providers and unavailable capabilities still fail closed; external-effect/environment policy is unchanged.

**Tests added:** provider metadata consistency tests prove runtime adapters match the authoritative declarations and unknown registrations fail closed.

**Final status:** VERIFIED — CI #738 passed deterministic install, schema checks, lint, typecheck, unit/security tests, production build and Playwright E2E.

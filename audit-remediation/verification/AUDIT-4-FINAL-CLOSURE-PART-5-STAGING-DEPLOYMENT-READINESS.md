# Audit 4 Final Closure — Part 5 Current Staging Deployment & Readiness Verification

Status: **BLOCKED — current main is not deployed to staging; readiness is not accepted**

Repository main reviewed:

`071df6339b66d923d58c8c765a84114a6990767c`

Post-merge CI:

- workflow: `CI`
- run: `#786`
- result: **SUCCESS**
- schema contract, drift proof, lint, typecheck, unit tests, security tests,
  build and E2E all passed.

Hosted Business OS Supabase before staging verification:

- project: `CodeEdge Business OS`
- project ref: `ljniurodhvbvpcztwlnh`
- status: `ACTIVE_HEALTHY`
- hosted migration parity: **29/29**

## Intended Part 5 gate

The production-readiness runbook requires:

1. deploy an immutable application release to the controlled staging environment;
2. verify the deployed release corresponds to the current approved repository revision;
3. verify `GET /api/health/ready`;
4. record the staging release identifier and previous-known-good release.

Current Business OS code exposes `/api/health/ready`.
There is no `/api/health/live` route in the current repository.

The readiness route returns HTTP 200 only when all six required configuration values
are present:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `CHAT_DATABASE_URL`
- `COMMUNICATION_DATABASE_URL`
- `AUTOMATION_RUNNER_SECRET`

Otherwise it returns HTTP 503 with a non-secret configured/required count.

## Existing Vercel staging project

Vercel project:

- name: `codeedge-business-os-test`
- project ID: `prj_B55tV0GJmSzpiiTWYRaiSJugep3A`
- team: `codeedge`

Latest existing READY deployment observed:

- deployment ID: `dpl_5ox53kxHdv4kzissb4JvvubtPGJT`
- deployment URL: `codeedge-business-os-test-aubhpn8oy-codeedge.vercel.app`
- state: `READY`
- target: `production` within the dedicated test project
- region: `iad1`
- created: **2026-09-25T20:42:21.607Z**

Current repository main was merged at:

**2026-09-27T16:49:40Z**

Therefore the READY staging deployment predates current main by nearly two days.
Its deployment metadata does not expose a Git commit SHA, so it cannot be accepted
as evidence that current main is deployed.

## Deployment attempt evidence

An exact-main branch
`audit4-part5-staging-deploy`
was created at
`071df6339b66d923d58c8c765a84114a6990767c`
to test whether the Vercel project was Git-integrated.

No new Vercel deployment appeared. The project remained at two historical
deployments. This proves the current staging project is not automatically deploying
this repository branch through Git integration.

The connected Vercel integration currently exposes the staging project and read
operations, but its deployment write action is unavailable server-side. The current
execution environment also has no authenticated Vercel CLI/browser deployment path.
No deployment credential was invented or exposed.

## Readiness endpoint attempt

The existing READY deployment is protected by Vercel authentication.

Attempts to access:

- `/api/health/ready`

through the connected authenticated Vercel fetch path and a temporary share bypass
were redirected to Vercel SSO before the application route executed.

This is **not** a readiness failure from the application. It is a deployment
protection/access limitation. Because the current application route did not execute,
no HTTP 200 readiness proof was obtained.

Recent Vercel runtime-error inspection reported no grouped runtime errors, and the
recent runtime-log window returned no application logs. These observations are
non-blocking context only and are **not** substituted for a current-main readiness
probe.

## Part 5 conclusion

Part 5 cannot be marked complete.

What is verified:

- current main is green;
- hosted database parity is 29/29;
- the staging Vercel project exists;
- the historical deployment is READY;
- the historical deployment is stale relative to current main;
- current staging is not Git-linked to the review branch;
- the readiness route exists in current code and its configuration contract is known.

What is not verified:

- current main deployed to staging;
- immutable deployment ID for current main;
- `/api/health/ready` returning HTTP 200 on current main;
- staging runtime logs for the current release.

## REL status after Part 5 attempt

- **REL-003 remains PARTIAL** — readiness code exists, but current staging readiness
  proof and external alert/uptime evidence remain.
- **REL-004 remains PARTIAL** — current staging deployment and rollback proof remain.

No REL finding is closed by this Part 5 attempt.

## Required continuation

Part 5 should resume from the deployment step once one authenticated Vercel write
path is available. The accepted continuation is:

1. deploy exact main
   `071df6339b66d923d58c8c765a84114a6990767c`
   to `codeedge-business-os-test`;
2. record deployment ID/URL and source revision;
3. verify deployment state `READY`;
4. invoke `/api/health/ready`;
5. require HTTP 200 and body `status: "ready"`;
6. inspect current-release runtime errors/logs;
7. record previous-known-good deployment for Part 7 rollback work.

## Safety statement

No production provider traffic was triggered.
No hosted database migration or row mutation occurred.
No Vercel protection setting was weakened.
No stale deployment was promoted.
No original Codeedge MVP resource was changed.

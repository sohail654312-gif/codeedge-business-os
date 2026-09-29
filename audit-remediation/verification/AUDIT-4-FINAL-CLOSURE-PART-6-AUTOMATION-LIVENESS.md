# Audit 4 Final Closure — Part 6 Automation Scheduler / Liveness Proof

Status: **PARTIAL — runtime health verified; real scheduler cadence/liveness still requires deployed staging proof**

Repository baseline reviewed:

`06c69e869e8b6f20aeb354be7bac5fc344bbfb12`

Hosted Supabase project:

- project: `CodeEdge Business OS`
- ref: `ljniurodhvbvpcztwlnh`
- status: `ACTIVE_HEALTHY`

## Runtime implementation verified

The internal Automation runner endpoint is:

`POST /api/internal/automation/run`

It:

- requires `AUTOMATION_RUNNER_SECRET`;
- requires a Bearer token;
- uses timing-safe token comparison;
- rejects missing configuration with HTTP 503;
- rejects unauthorized callers with HTTP 401;
- bounds requested batch size to 1–50;
- invokes the tenant-safe Automation runner.

The authenticated health endpoint is:

`GET /api/internal/automation/health`

It:

- requires the same protected runner secret;
- reports pending/running/stale counts;
- reports oldest pending age;
- reports last started/completed timestamps;
- is healthy only when stale-running count is zero and oldest pending age is at most 600 seconds.

## Live database health evidence

Read-only hosted execution of `public.automation_runtime_health()` returned:

- pending runs: **0**
- running runs: **0**
- stale running runs: **0**
- oldest pending age: **0 seconds**
- last started: **null**
- last completed: **null**

This proves the current hosted queue is clean. It does **not** prove scheduler cadence,
because there is currently no workload and no observed runner heartbeat.

## Scheduler evidence

A read-only hosted check found:

- `pg_cron` extension installed: **false**
- `cron` schema present: **false**

The repository does not contain an automatic scheduler workflow for
`/api/internal/automation/run`.

This is consistent with the intended external scheduler model, but there is currently
no operational evidence that a deployed scheduler is invoking the runner at a defined
cadence.

## Part 6 conclusion

Verified:

- runner endpoint implementation;
- secret-based authentication;
- batch bounds;
- runtime-health implementation;
- hosted queue currently healthy/empty;
- no stale Automation work exists.

Not yet verified:

- real deployed scheduler exists;
- scheduler cadence;
- repeated runner invocation;
- last-started/last-completed heartbeat under real scheduled execution;
- alerting on missed cadence/backlog.

## REL-006 status

**REL-006 remains PARTIAL — runtime health verified; scheduler cadence/liveness proof pending staging deployment.**

Once Part 5 deploys the current application to the dedicated Vercel test project,
Part 6 should perform a controlled scheduler/runner invocation in Demo/Sandbox mode,
confirm health before/after, and record the resulting heartbeat without external
business effects.

## Safety statement

No Automation run was triggered.
No provider action was triggered.
No database row was mutated.
No scheduler was installed.
No production or MVP resource was changed.


## 29 September 2026 — Part 6 safe preparation started

Part 6 preparation has started independently of the Part 5 framework-security
blocker. This preparation does not deploy or alter the current staging release.

Fresh read-only hosted verification on the Business OS Supabase project showed:

- pending Automation runs: **0**
- running Automation runs: **0**
- stale running Automation runs: **0**
- oldest pending age: **0 seconds**
- last started: **null**
- last completed: **null**
- total rows in `automation_runs`: **0**
- total Automation workflows: **0**
- enabled Automation workflows: **0**
- `pg_cron` installed: **false**
- `cron` schema present: **false**

The empty queue/workflow state means a liveness proof must not manufacture a
Production business event merely to obtain timestamps.

### Safe liveness preflight added

A protected probe mode has been added to:

`POST /api/internal/automation/run?probe=1`

The probe:

- requires the existing `AUTOMATION_RUNNER_SECRET` authentication;
- uses the existing Automation capability/database boundary;
- evaluates current Automation runtime health;
- does **not** claim a pending run;
- does **not** execute actions;
- does **not** create provider traffic.

A non-secret verification script and protected manual workflow were also added:

- `scripts/audit4-automation-liveness-probe.mjs`
- `.github/workflows/audit4-part6-automation-liveness.yml`

The workflow is intentionally `workflow_dispatch` only at this stage. A recurring
scheduler is **not** activated while Part 5 has not produced a current, verified
staging deployment. This prevents a scheduler from repeatedly targeting a stale or
security-blocked release.

### Remaining Part 6 closure gate

After Part 5 is verified:

1. run the protected liveness preflight against the exact current staging release;
2. verify repeated authenticated probe delivery at an explicit cadence;
3. perform a controlled Demo/Sandbox runner exercise if a safe test run is available;
4. confirm queue health before/after and capture non-secret run/heartbeat evidence;
5. add/verify missed-cadence or backlog alert proof;
6. only then mark REL-006 closed.

Part 6 therefore remains **PARTIAL**, but the safe verification path is now prepared.

### Safety

No database row was inserted, updated or deleted.
No migration was applied.
No Automation run was claimed.
No provider or customer action was triggered.
No Part 5 branch or Vercel deployment was modified.
No MVP or website repository was touched.


## 29 September 2026 — CI and inherited Vercel blocker evidence

The Part 6 preparation branch passed the full repository CI suite:

- pull request: #69
- branch: `audit4-part6-liveness-prep`
- candidate SHA: `16f16245455c9f7b7218b9e8ff237115e02b8daf`
- CI run: `36548378082`
- result: **SUCCESS**

Vercel also attempted preview deployments for this branch. The latest inspected
deployment was:

- deployment ID: `dpl_BNxSHHHT9UmC5nXtjbsq2Bsr6VdR`
- source SHA: `16f16245455c9f7b7218b9e8ff237115e02b8daf`
- state: `ERROR`
- Vercel error code: `VULNERABLE_NEXTJS_VERSION`
- error step: `direct:build`

An earlier deployment created from the Part 6 probe-code commit
`c5edf7bde9da9fe8cddf43a0ab98afea811b9d66` failed with the same Vercel
security code.

### External-audit interpretation

These Vercel preview failures are **not evidence that the Part 6 Automation changes
failed CI, broke the runner, or introduced an application regression**.

They occur before the application reaches runtime and are the same inherited
framework-security gate already recorded for Part 5 while the repository remains
pinned to Next.js 15.5.26.

The correct interpretation is:

- Part 6 repository implementation/preflight: **CI verified**
- Part 6 deployed runtime proof: **not yet obtainable**
- reason deployed proof is unavailable: **inherited Part 5 / Next.js Vercel security gate**
- database/provider impact from the Part 6 preparation: **none**

This distinction must be preserved in any external audit report so that repeated
Vercel `VULNERABLE_NEXTJS_VERSION` preview failures are not counted as separate
Part 6 defects.

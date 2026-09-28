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

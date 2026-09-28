# Audit 4 Final Closure — REL-005 and REL-007 Technical Verification

Status: **REL-005 VERIFIED / CLOSED; REL-007 VERIFIED / CLOSED**

Repository baseline before this closure branch:

`9caf357412e6d414bd06453f74c5abc8e5003f77`

## REL-005 — Vapi transient webhook failure semantics

Original finding:

Trusted Vapi webhook events that hit transient ingestion/database failures were mapped
to HTTP 400, risking permanent provider event loss because a provider could treat the
response as non-retryable.

Current implementation:

`src/app/api/channels/voice/vapi/webhook/route.ts`

Behavior is now explicit:

- malformed/unparseable payload → HTTP 400;
- missing/unknown provider connection → HTTP 401/400 as appropriate;
- failed webhook authentication → HTTP 401;
- trusted + parsed event whose ingestion fails → **HTTP 503**;
- successful trusted ingestion → HTTP 204.

The 503 path occurs only after parsing, provider-connection resolution and bearer
verification have succeeded, so malformed or unauthorized traffic is not encouraged
to retry as a trusted event.

Unit coverage:

`tests/unit/voice-webhook-route.test.ts`

The test suite explicitly proves:

1. a trusted parsed event with a transient ingest failure returns 503 and attempts
   ingestion exactly once;
2. malformed provider input remains a non-retryable 400 and never reaches ingestion.

Closure:

**REL-005 — VERIFIED / CLOSED**

No live Vapi call is required to prove the server-side response contract. The route
behavior and regression tests directly cover the original defect.

## REL-007 — Automation causal-chain and external-effect circuit breaking

Original finding:

Automation lacked database-enforced causal depth, cycle/action-budget protection,
allowing runaway event chains or excessive external effects.

Database enforcement:

`supabase/migrations/20260927000100_audit4_automation_reliability.sql`

The hosted schema contains the merged reliability migration and enforces:

- correlation event budget: maximum **32** events;
- causal-chain depth: maximum **8**;
- external-effect budget: maximum **16** per correlation;
- budget counters stored in
  `private.automation_correlation_budgets`;
- browser roles have no access to the private budget table;
- external-effect budget claiming is restricted to the Automation capability role.

Existing runner coverage already verifies that a live-capable Automation action claims
the database external-effect budget before provider-capable execution.

This closure branch adds database-level security tests:

`tests/security/automation-reliability-budgets.test.ts`

The tests prove the exact boundaries:

1. event count 31 → 32 succeeds; the 33rd event is rejected with
   `automation_correlation_event_budget_exceeded`;
2. a causal chain at depth 8 is rejected with
   `automation_correlation_depth_exceeded`;
3. external-effect count 15 → 16 succeeds; the 17th effect is rejected with
   `automation_external_effect_budget_exceeded`.

These tests execute against the disposable CI database, exercising the actual
PostgreSQL functions rather than mocking the limits in application code.

Closure:

**REL-007 — VERIFIED / CLOSED**

The original runaway-chain/action-budget defect is now enforced in the database and
covered at its exact threshold values.

## Safety

No hosted database mutation was performed for this closure.
No Vapi/provider traffic was generated.
No Automation provider action was generated.
No Vercel deployment was changed.
No original Codeedge MVP resource was touched.

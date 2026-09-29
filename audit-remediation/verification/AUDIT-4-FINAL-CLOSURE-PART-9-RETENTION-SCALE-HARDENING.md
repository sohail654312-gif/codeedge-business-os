# Audit 4 Final Closure — Part 9 Retention / Scale Hardening

Status: **PARTIAL — query-scale hardening implemented; destructive retention policy intentionally not invented**

Repository baseline before hardening: `8e824312f20f072c0be3034a4543cae6f44a9d4a`

Hosted project state at review:

- all operational/history tables currently contain zero application rows;
- relevant time/order indexes are already present across CRM activity, messages,
  deliveries, AI history, Finance execution, Automation events, security audit events,
  Voice provider events and Website Chat sessions.

## Existing bounded reads verified

Before this Part 9 hardening the following important reads were already bounded:

- Lead search: 250
- Shared Inbox conversations: 100
- Conversation messages: 500
- Lead CRM activity history: 100
- Lead conversations: 20
- Booking lead selector: 200
- Booking customer selector: 200
- AI recent sessions: 10
- AI messages: 30 in dashboard
- AI proposals: 20 in dashboard
- Automation claim batch: max 50

## Additional hardening implemented

This branch removes four remaining unbounded dashboard/history reads:

- Lead notes → **limit 200**
- Quote requests → **limit 100**
- Appointment list → **limit 500**
- Conversation delivery-status history → **ordered and limit 500**

These changes are tenant-scoped and do not alter write behavior, external effects,
provider integrations, or database contents.

## Retention / cleanup review

Operational-history tables include:

- CRM activities
- messages / message deliveries
- provider metadata/events
- Automation events/runs/action runs
- Finance execution records
- AI sessions/messages/model/tool runs
- security audit events
- Website Chat sessions

The schema already includes useful time/order indexes, including an expiry index on
`website_chat_sessions.expires_at`.

However, no owner-approved retention windows currently exist for these records.

An automated deletion/archival schedule is **not introduced here**, because selecting
retention durations affects customer records, audit evidence, support/debug history,
privacy obligations and potentially legal/compliance requirements. Inventing those
durations during a technical audit would be unsafe.

## REL-011 status

After this Part 9 hardening:

**REL-011 becomes PARTIAL — large-dataset read hardening materially improved; retention/archive duration policy remains open.**

To close REL-011, Codeedge must explicitly approve retention classes/durations for at
least:

1. customer communications;
2. CRM history;
3. provider webhook/event history;
4. Automation execution history;
5. Finance execution/reconciliation history;
6. AI operational history;
7. security audit history.

Once approved, cleanup/archive execution can be added with dry-run reporting,
tenant-safe batches and audit logging before deletion.


## 29 September 2026 — retention decision gate formalized

The remaining REL-011 policy dependency is now represented by:

`docs/operations/audit4-retention-policy-decision.md`

This record lists the seven required retention classes, preserves the rule that
engineering must not invent durations, and defines the mandatory safe rollout sequence
for any future cleanup/archive implementation.

This materially reduces the remaining Part 9 ambiguity: the technical query-scale
hardening is already implemented, while the only policy blocker is explicit owner
approval of retention/archive durations and hold requirements.

No destructive cleanup code or scheduler was activated by this preparation.

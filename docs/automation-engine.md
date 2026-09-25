# Codeedge Automation Engine

Codeedge owns the Automation Engine. It connects existing Business OS domains; it does not replace CRM, Booking, Shared Inbox, Communication, Voice, or provider adapters.

## Execution model

```text
Trusted Codeedge domain change
  -> automation_domain_events
  -> matching enabled workflow
  -> automation_runs
  -> Trigger validation
  -> declarative Conditions
  -> Codeedge Action Registry
  -> existing Codeedge domain/service
  -> run + action audit history
```

Initial triggers:

- `lead.created`
- `lead.status_changed`
- `conversation.created`
- `message.received`
- `appointment.created`
- `appointment.confirmed`
- `appointment.rescheduled`
- `appointment.cancelled`
- `voice.call.completed`
- `voice.call.failed`
- `voice.handoff.requested`

Unknown triggers fail closed.

## Conditions

Conditions are declarative JSON only. Supported operators are:

- `eq`
- `not_eq`
- `exists`
- `not_exists`

Paths are restricted dotted field paths such as `lead.status` or `conversation.channel`.

The engine does not execute arbitrary SQL, JavaScript, shell commands, `eval()`, or user-supplied executable code.

## Initial actions

- `crm.update_lead_status`
- `communication.send_whatsapp`
- `communication.send_email`
- `communication.send_sms`
- `internal.flag_conversation`

Communication actions call Codeedge channel services. They do not call Meta, Resend, Twilio, Vapi, or other provider APIs directly.

Each action has an external-effect classification and retry classification. External messaging uses a deterministic request UUID derived from the Automation run and action index. A recovered worker therefore reuses the same Codeedge delivery request instead of creating a second provider send.

## Demo dry-run

When a workspace execution mode is `demo`:

- internal safe actions may execute against Demo data
- external-effect actions are recorded as `simulated`
- the provider-backed communication service is not invoked
- action history records `dryRun: true`

This makes Demo useful for showing workflow behavior without sending a real WhatsApp message, Email, SMS, or other external effect.

Sandbox and Production continue through the existing Codeedge external-effect policy and provider-environment checks.

## Tenant safety

Business identity comes from trusted domain records and the claimed Automation run.

Workflow action JSON cannot choose the authoritative `business_id`.

Automation database access uses the non-login, non-inheriting, non-RLS-bypass `codeedge_automation_api` role. Run-scoped security-definer RPCs verify the tenant before internal writes.

Authenticated users may read their tenant's workflow/run history. Only owners may create/change/delete workflows. Browser roles cannot insert domain events or mutate run history.

## Correlation and causation

Domain events contain:

- event ID
- business ID
- event type
- occurrence time
- subject type / ID
- correlation ID
- causation ID
- payload

When an Automation internal action causes another tracked domain event, Codeedge propagates the original correlation ID and stores the source event as causation.

## Worker and retry behavior

`POST /api/internal/automation/run` is a server-only runner entrypoint protected by `AUTOMATION_RUNNER_SECRET`.

The worker:

1. claims pending runs with `FOR UPDATE SKIP LOCKED`
2. validates workflow/event configuration
3. evaluates conditions
4. executes actions in order
5. records every action outcome
6. records the terminal run status

Runs stuck in `running` for more than ten minutes are eligible for recovery. Recovery is bounded at three attempts. Retry-safe actions are designed to be idempotent or safe internal operations.

## Current foundation scope

This phase intentionally starts with a focused trigger/action set. It does not build arbitrary-code workflows, Jarvis, generalized autonomous AI employees, or direct provider integrations.

Scheduling/wait nodes, richer workflow-builder UX, additional Booking actions, notification actions, and future AI Employee orchestration can extend this Codeedge-owned engine later without replacing it.

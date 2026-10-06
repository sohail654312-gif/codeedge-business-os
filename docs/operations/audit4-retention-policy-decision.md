> Historical preparation preserved during V1 integration on 6 October 2026. The owner's V1 scope supersedes historical release gates here; see docs/releases/BUSINESS-OS-V1.md for current release policy and evidence.

# Codeedge Business OS — Retention Policy Decision Record

Status: **OWNER APPROVAL REQUIRED — NO DESTRUCTIVE POLICY ACTIVE**

Status date: 29 September 2026

## Purpose

This record separates technical retention readiness from the business/legal decision
that determines how long each class of operational data must be retained.

Engineering must not invent these durations. No Production cleanup or destructive
scheduler may be enabled until the policy owner explicitly approves the values below.

## Required owner decisions

| Data class | Approved retention duration | Archive before deletion? | Legal/operational hold required? | Approval state |
| --- | --- | --- | --- | --- |
| Customer communications and message content | Not yet approved | Not yet approved | Yes — must be defined | OPEN |
| CRM activity/history | Not yet approved | Not yet approved | Yes — must be defined | OPEN |
| Provider webhook/delivery/event history | Not yet approved | Not yet approved | Yes — preserve reconciliation evidence | OPEN |
| Automation execution history | Not yet approved | Not yet approved | Yes — preserve causal/idempotency evidence | OPEN |
| Finance execution/reconciliation history | Not yet approved | Not yet approved | Yes — accounting/audit requirements apply | OPEN |
| AI operational history | Not yet approved | Not yet approved | Yes — privacy/support requirements apply | OPEN |
| Security audit history | Not yet approved | Not yet approved | Yes — separate high-integrity class | OPEN |

## Technical invariants already required

Any future cleanup/archive implementation must:

- derive business identity from trusted server-side context;
- operate on exactly one tenant at a time;
- never trust a browser-supplied business ID as authorization;
- support dry-run reporting before mutation;
- use bounded batches;
- be idempotent and safe to retry;
- preserve required provider/idempotency/reconciliation evidence;
- respect legal and operational holds;
- keep Demo/Sandbox and Production policy separate;
- write non-secret audit evidence for every lifecycle job;
- fail closed if policy state or tenant ownership cannot be proven.

## Rollout sequence after owner approval

1. record the approved durations and effective date;
2. map each data class to exact tables/fields;
3. implement dry-run-only reporting first;
4. verify tenant scoping and legal-hold exclusions;
5. verify archive behavior where required;
6. enable bounded cleanup only in Demo/Sandbox;
7. inspect evidence and rollback/recovery implications;
8. enable Production only through an explicit reviewed release;
9. monitor deletion/archive jobs and retain execution audit evidence.

## Current safety state

No Production deletion scheduler is active.
No retention duration has been guessed.
No historical record is being deleted or anonymized by this preparation.

# Codeedge Business OS — Data Retention and Deletion Security Policy

Status: Audit 2 security baseline  
Scope: tenant-owned operational history, provider records, automation history, Finance execution history, and security audit events.

## Purpose

Codeedge represents retention and deletion as an explicit, tenant-aware lifecycle policy. This repository does **not** invent legal or contractual retention periods and does **not** enable an automatic destructive Production purge.

Retention durations and legal-hold requirements must be approved by the business/policy owner before any Production deletion schedule is enabled.

## Security invariants

Any future retention or deletion operation must:

- derive the target business from trusted server-side context;
- never accept a browser-supplied business ID as authorization;
- scope every selection and mutation to exactly one business;
- be idempotent and safe to retry;
- preserve required referential integrity and provider reconciliation/idempotency evidence;
- respect legal/operational holds before deletion or anonymization;
- keep Demo/Sandbox policy separate from Production policy;
- record security-sensitive lifecycle execution without storing raw secrets or deleted sensitive payloads;
- fail closed when tenant ownership or policy state cannot be proven.

A lifecycle operation for Business A must never read, anonymize, or delete Business B data.

## Data classes

| Data class | Lifecycle considerations |
|---|---|
| Conversations | May contain PII; preserve thread/customer references required by retained messages, bookings, and audit evidence. |
| Messages | May contain PII/content; deletion or anonymization must preserve delivery/provider reconciliation and required evidence. |
| Voice transcripts | Potentially sensitive; redaction/anonymization may be preferable to hard deletion when approved policy requires continued call evidence. |
| Provider event/delivery records | Preserve idempotency, retry safety, reconciliation, and incident evidence for the approved period. |
| Automation run/action history | Preserve causal/idempotency evidence needed to understand or safely retry automated work. |
| Finance execution history | Potential accounting/audit obligations apply; no automated deletion is permitted without an approved Finance retention policy. |
| Security audit events | Separate high-integrity retention class. Append-only security accountability must not be weakened by ordinary tenant deletion. |

## Deletion and anonymization boundary

There is currently **no enabled Production deletion scheduler** for these data classes.

A future lifecycle implementation must use a Codeedge domain/service boundary rather than direct browser deletion. It must accept a trusted tenant context and a policy decision, select only records belonging to that tenant, and produce an auditable result. Cross-tenant deletion is a security failure and must abort the operation.

Where anonymization can satisfy an approved policy with lower integrity risk, prefer anonymization of content/identifiers over deleting operational linkage required for idempotency, reconciliation, accounting, or security investigations.

## Environment policy

- **Demo:** may use shorter disposable-data lifecycles when explicitly configured.
- **Sandbox/Test:** may use test-only cleanup policies; never reuse Production credentials or treat test cleanup as Production policy.
- **Production:** destructive lifecycle execution remains disabled until approved retention durations, legal-hold behavior, backup implications, and operational controls are configured.

## Policy decisions still external to code

Before Production lifecycle automation is enabled, the policy owner must approve:

- retention duration per data class;
- legal/contractual minimums and holds;
- customer deletion/anonymization behavior;
- backup/restore treatment of deleted data;
- security-audit-event retention;
- Finance/accounting retention;
- operational authorization and monitoring for deletion jobs.

This document satisfies the repository requirement that retention/deletion behavior be represented explicitly while intentionally leaving jurisdiction- and business-specific durations to approved policy rather than embedding arbitrary values in code.

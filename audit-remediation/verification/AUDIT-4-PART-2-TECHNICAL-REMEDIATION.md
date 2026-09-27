# Audit 4 — Part 2 Technical Remediation Record

Starting main: `9dc743f705b325d5d21935e8517983eacc120a25`

This branch contains technical remediation only. It does not apply migrations
to the live Supabase project and does not deploy public production.

## Implemented in this branch

- REL-001: hosted migration parity command added; live parity remains open.
- REL-003: public configuration-readiness endpoint added; centralized external
  alert delivery remains a Part 3 gate.
- REL-004: deployment/rollback runbook added; live rollback proof remains open.
- REL-005: trusted Vapi ingestion failures now return retryable HTTP 503.
- REL-008: ERPNext requests have a 10-second timeout; provider/network outcomes
  that cannot be proven are classified as ambiguous and Finance persists that
  state instead of falsely recording a safe failure.

## Still required in Part 2 / Part 3

- REL-002: real backup plus isolated restore drill.
- REL-006: authenticated Automation runtime health is implemented; actual
  scheduler deployment/cadence proof remains a Part 3 gate.
- REL-007: database-enforced correlation depth, total-event and external-effect
  budgets are implemented on this branch.
- REL-009: production connection/pool topology evidence.
- REL-010: online migration operational discipline.
- REL-011: retention/archive/pagination scale hardening.

No live provider traffic, production migration, production deployment, or
original Codeedge MVP change is included.

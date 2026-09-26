# Codeedge Business OS — persistent project instructions

Before development, remediation, architecture work, or any audit-status question, read:

- `docs/audits/AUDIT-STATUS.md`
- `docs/audits/REMEDIATION-REGISTER.md`
- `docs/audits/DELTA-AUDIT-PROTOCOL.md`

The four-audit programme is already COMPLETE for the recorded stable baseline. Do not repeat a completed full audit unless the user explicitly requests a full re-audit.

When current `main` differs from an audited baseline, compare the SHAs, identify changed domains, and re-verify only affected findings and cross-cutting boundaries. Preserve unaffected historical conclusions.

Do not mark any finding remediated or VERIFIED without explicit evidence tied to a commit SHA and the relevant CI/configuration/production proof.

Audit completion, remediation completion, feature completion, and production readiness are separate states.

The original `sohail654312-gif/codeedge` MVP is an external protected reference/core. Do not modify it as part of Business OS work unless the user explicitly authorizes that repository itself.

Current Audit 1 remediation context is recorded in the remediation register. In particular, do not claim Audit 1 remediation is complete while A1-01 branch protection is blocked or PR #48 remains unmerged.

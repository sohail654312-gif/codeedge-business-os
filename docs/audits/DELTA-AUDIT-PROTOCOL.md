# Codeedge Business OS — Delta-Audit Protocol

1. Read `AUDIT-STATUS.md` and `REMEDIATION-REGISTER.md`.
2. Record the relevant audit baseline SHA and current `main` SHA.
3. Compare baseline -> current main.
4. Classify changed files by domain: auth/tenant, database/migrations, CRM, conversations/channels, booking, voice, automation, finance, AI, CI/deployment/docs.
5. Map changed domains to existing findings.
6. Re-verify only affected findings and cross-cutting boundaries. Preserve unaffected conclusions.
7. Preserve historical findings exactly; append verification evidence rather than rewriting history.
8. Move a finding to VERIFIED only with explicit evidence, commit SHA, tests/CI where relevant, and production/config proof where operational.
9. A code change that appears related is not enough to close a finding.
10. Keep audit completion separate from remediation completion, feature completion, and production readiness.

When asked “check the audit”, use this delta procedure rather than restarting the full four-audit programme.

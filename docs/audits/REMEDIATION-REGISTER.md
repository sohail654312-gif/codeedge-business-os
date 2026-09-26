# CODEEDGE BUSINESS OS — REMEDIATION REGISTER

Original four-audit stable baseline: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`
Current main observed before this audit-memory documentation commit: `5be0269a6df961c965194dc06f61f9ef51ef9a2e`

## Audit 1

Remediation PR #48: `Audit 1 Remediation — Technical & Architecture`
Head: `b561fb7e404165fb8ac52039d9c40cb418921485`
State: OPEN, clean/mergeable, NOT merged.
CI #734: GREEN. ERPNext disposable Finance Engine smoke #21: GREEN.

- A1-01 — BLOCKED — GitHub `main` protection/ruleset not configured; no required `build`, PR-before-merge, force-push/deletion/direct-push enforcement.
- A1-02 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-03 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-04 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-05 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-06 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-07 — VERIFIED ON PR #48 BRANCH — not merged.
- A1-08 — VERIFIED ON PR #48 BRANCH — not merged.

Audit 1 remediation closure: 7/8 verified; incomplete until A1-01 enforcement is genuinely proven and PR #48 is safely merged with final main verification.

## Audits 2–4

No formal remediation programme has closed these findings. Keep every SEC-*, FUNC-* and REL-* item OPEN/PENDING RE-VERIFICATION unless a dedicated remediation record proves it.

Important overlaps:
- SEC-001: current main uses Next.js 15.5.26 after PR #47, so the original vulnerable-version condition may be addressed; formal Audit 2 re-verification is still required.
- SEC-004 overlaps A1-01 and remains blocked while `main` is unprotected.
- SEC-005 overlaps A1-02; lockfile/`npm ci` work exists on PR #48 but is not merged and Audit 2 has not been re-verified.
- Later feature-completion work may overlap FUNC findings; do not mark them resolved without targeted verification.
- Test Supabase/Vercel work does not automatically remediate REL-001/REL-002 or other production findings.

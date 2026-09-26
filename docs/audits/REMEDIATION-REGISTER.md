# CODEEDGE BUSINESS OS — REMEDIATION REGISTER

Original four-audit stable baseline: `0a7c3e446a097bcf6cbbc0f2571a9cfce6fa5d3a`
Audit 1 closure main: `780d152f6957c4dd24e6d6e30874ef5ed5edce6d`

## Audit 1

Remediation PR #48: `Audit 1 Remediation — Technical & Architecture`
Final PR head: `ac34271e627c88a0b464edfad13ed62a1f2e4f0e`
Merge commit: `780d152f6957c4dd24e6d6e30874ef5ed5edce6d`
State: MERGED.
Final PR CI #739: GREEN.
ERPNext disposable Finance Engine smoke #24: GREEN.
Post-merge main CI #740: GREEN.

- A1-01 — VERIFIED — active `Protect main` ruleset requires PR + GitHub Actions `build`, requires up-to-date branch, blocks deletion/non-fast-forward pushes, has no bypass actors, and current user cannot bypass.
- A1-02 — VERIFIED AND MERGED.
- A1-03 — VERIFIED AND MERGED.
- A1-04 — VERIFIED AND MERGED.
- A1-05 — VERIFIED AND MERGED.
- A1-06 — VERIFIED AND MERGED.
- A1-07 — VERIFIED AND MERGED.
- A1-08 — VERIFIED AND MERGED.

Audit 1 remediation closure: **8/8 VERIFIED — CLOSED**.

## Audits 2–4

No formal remediation programme has closed these findings. Keep every SEC-*, FUNC-* and REL-* item OPEN/PENDING RE-VERIFICATION unless a dedicated remediation record proves it.

Important overlaps:
- SEC-001: current main uses Next.js 15.5.26 after PR #47, so the original vulnerable-version condition may be addressed; formal Audit 2 re-verification is still required.
- SEC-004 overlaps A1-01, but Audit 1 closure does not automatically close Audit 2.
- SEC-005 overlaps A1-02, but Audit 2 has not been re-verified.
- Later feature-completion work may overlap FUNC findings; do not mark them resolved without targeted verification.
- Test Supabase/Vercel work does not automatically remediate REL-001/REL-002 or other production findings.

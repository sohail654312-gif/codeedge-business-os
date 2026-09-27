# Audit 4 Final Closure — Part 2 Isolated Restore Evidence

Status: **COMPLETE — isolated restore and tenant/RLS verification passed**

Source repository main used for recovery: `db2d6395332e76d3b39c3eb7becdc549dd9cb88f`

Source hosted Supabase project after proof:

- name: `CodeEdge Business OS`
- ref: `ljniurodhvbvpcztwlnh`
- status: `ACTIVE_HEALTHY`
- hosted project mutation during Part 2: **none**

## Isolated restore method

A disposable Supabase stack was created on a GitHub-hosted Ubuntu runner.

The restore project was initialized separately from the repository's full migration
tree. Exactly the nine migration SQL files captured by Part 1 were copied into the
disposable project's migration directory and applied in lexical order.

This deliberately prevented later repository migrations from being applied to the
restore proof.

No hosted Supabase project slot was used.
The paused Business OS test project was not resumed.
The MVP pilot project was not paused or modified.

## Successful proof

Workflow:

- name: `Audit 4 Part 2 isolated restore proof`
- run: `36319096231`
- workflow head: `a8d36e7ecceed6b0efb317cfe7194bcb028af248`
- result: **SUCCESS**
- artifact ID: `10932205756`
- artifact: `audit4-part2-isolated-restore-proof`
- artifact digest: `sha256:13e8afe639a95d676ecb408a035e8a613446cfad26e134c2c00c3d094b02e353`
- evidence capture: `2026-09-27T12:30:50Z`

## Restore verification

The disposable restored database proved:

- restored migration count: **9**
- PostgreSQL major: **17**
- zero application rows after restore: **PASS**
- zero auth users after restore: **PASS**
- zero storage objects/buckets after restore: **PASS**
- forced RLS application tables: **8/8**
- tenant isolation: **PASS**
- cross-tenant read: **DENIED**
- cross-tenant update: **DENIED**

The tenant-boundary verification inserted two disposable users and two disposable
businesses inside a transaction, assumed the authenticated identity of Tenant A,
proved Tenant A could see/update only its own business, proved Tenant B remained
invisible and immutable, then rolled the entire fixture transaction back.

## Fingerprint comparison

All five fingerprints exactly matched the Part 1 live hosted capture:

- columns MD5: `73767219aa6927e4699c36678ab40cb3`
- indexes MD5: `b89d41103eb9dc78dd6bdef640fe9a17`
- policies MD5: `3ed0e486d765748d82d36a4f0b66b91c`
- triggers MD5: `0fbb260aa24b146bf977f88eb38bbb52`
- functions MD5: `adcc0e0ac38ea17b787f7fb897ca439e`

This proves the isolated restore reproduced the captured hosted application schema
and security state.

## REL-002 status after Part 2

The technical backup/restore drill is now **VERIFIED**:

- recoverable Part 1 bundle: verified;
- off-database artifact integrity: verified;
- isolated restore: verified;
- restored schema parity: verified;
- forced RLS and tenant boundary: verified.

Formal REL-002 closure still requires the operational owner to approve explicit
RPO and RTO targets, because the production-readiness runbook intentionally does
not invent those business values.

Therefore REL-002 is:

**PARTIAL — BACKUP/RESTORE TECHNICAL PROOF COMPLETE; RPO/RTO APPROVAL PENDING**

## Safety statement

No hosted migration was applied.
No hosted database row was written or deleted.
No hosted Supabase project was paused, resumed, created, or deleted.
No Vercel deployment was changed.
No provider traffic was triggered.
No MVP resource was changed.
The disposable restore environment was stopped after verification.

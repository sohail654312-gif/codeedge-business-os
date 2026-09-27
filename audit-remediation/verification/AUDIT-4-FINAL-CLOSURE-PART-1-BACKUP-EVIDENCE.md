# Audit 4 Final Closure — Part 1 Backup Evidence

Status: **COMPLETE — backup evidence created; restore intentionally not attempted**

Source repository main at capture: `4fdbd97d5e0fa60d94c2589dacaaf67146da3401`

Source Supabase project:

- name: `CodeEdge Business OS`
- ref: `ljniurodhvbvpcztwlnh`
- region: `ap-south-1`
- plan: Free
- status after capture: `ACTIVE_HEALTHY`

## Backup method selected

The preferred Supabase CLI logical-dump path was attempted first using the protected
`audit4-staging` environment. It failed closed before any dump because
`MIGRATION_DATABASE_URL` is not configured in that GitHub Environment.

No secret was exposed, no database write occurred, and no partial dump was accepted.

Live inspection then proved the current hosted application state contains:

- zero rows in every one of the eight public application tables;
- zero `auth.users`;
- zero `storage.objects`;
- zero `storage.buckets`;
- exactly nine hosted application migrations.

Because there is no application/auth/storage data to preserve, the current hosted
application state is recoverable from the exact nine applied migration SQL files plus
the captured live schema/security fingerprint. A recovery bundle was therefore created
from the verified repository revision and cross-checked against live Supabase evidence.

## Recovery bundle evidence

Successful workflow run:

- workflow: `Audit 4 Part 1 recovery bundle`
- run: `36318080462`
- workflow head: `85fb1af8dd52e96c1531084a423d0138bdfd57d2`
- artifact ID: `10931233215`
- artifact name: `audit4-part1-recovery-bundle`
- artifact retention: 7 days
- artifact digest reported by GitHub: `sha256:9b967bb967d878423cf13e23f4ad7dcda23038aedf05feb10d592b1bd9e69ab4`
- recovery tarball SHA-256: `52abdf4dcdf5b8bae42f36d80a67846b65918f46b4278916cfdea8b53e4173c1`

The tarball contains:

- the exact nine SQL migration files that correspond to the hosted migration names;
- `LIVE-EVIDENCE.json`;
- `RESTORE-NOTES.md`;
- `SHA256SUMS.txt`.

Independent verification after artifact download confirmed:

- outer tarball checksum: PASS;
- all internal file checksums: PASS;
- migration file count: 9;
- source project ref: correct;
- zero-data evidence: correct;
- eight application tables recorded with forced RLS;
- restore flag: `false`.

## Live schema/security fingerprint at capture

Capture timestamp: `2026-09-27T12:07:40.815443+00:00`

- columns MD5: `73767219aa6927e4699c36678ab40cb3`
- indexes MD5: `b89d41103eb9dc78dd6bdef640fe9a17`
- policies MD5: `3ed0e486d765748d82d36a4f0b66b91c`
- triggers MD5: `0fbb260aa24b146bf977f88eb38bbb52`
- functions MD5: `adcc0e0ac38ea17b787f7fb897ca439e`

Installed extensions recorded:

- `pg_stat_statements 1.11`
- `pgcrypto 1.3`
- `plpgsql 1.0`
- `supabase_vault 0.3.1`
- `uuid-ossp 1.1`

## REL-002 status after Part 1

REL-002 is **PARTIAL — BACKUP EVIDENCE COMPLETE / ISOLATED RESTORE PENDING**.

Part 1 does **not** close REL-002 because no restore was attempted. Closure requires
Part 2 to restore this bundle into an isolated Supabase environment and verify the
schema, forced RLS, tenant boundaries, migration state, and captured fingerprints.

## Safety statement

No restore was performed.
No migration was applied.
No Supabase project was paused, restored, deleted, or created.
No live provider traffic was triggered.
No production/customer data was changed.
The original Codeedge MVP repository was not touched.

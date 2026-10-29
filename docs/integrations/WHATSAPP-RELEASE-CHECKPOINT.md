# WhatsApp release checkpoint — 29 October 2026

The live connection is not complete. PR #83 remains open; no automatic main merge is authorized. The owner confirmed that the Codeedge Business Portfolio exists; developer sign-in is still the next owner gate.

## Verified code and Preview

- Published implementation head before this documentation/baseline update: `de24683db7ea53443a1d647b8e3303f7a7f4a353`.
- CI #903 passed the repository workflow, including schema checks, regression/security tests, build and Playwright. This is code evidence, not live Meta evidence.
- The same head has a READY Vercel Preview. Its WhatsApp health endpoint was checked on 29 October and returned 503, `not_configured`, `liveConnectionVerified: false`.
- Today's local checks passed: schema contract; 11 media/template tests; 24 WhatsApp isolation, production-control and acceptance tests. These include the two recorded baseline migrations below.

## Reproducible existing database baseline

The test database previously contained 33 applied migrations while main recorded 31. The two existing CIGO migrations are now recorded using SQL captured from the actual applied migration ledger, rather than replaying or editing hosted history:

| File | Existing hosted version | SHA-256 of normalized LF source |
| --- | --- | --- |
| `20261006000100_cigo_read_v1.sql` | `20261006075616` | `e04aa35f21c96ddd0d4064558795b5e66ac1794d84ffb62ab854d6755495191b` |
| `20261006000200_cigo_read_private_boundary.sql` | `20261006093006` | `825208af2c864d73350f921302e7c6ae5a38c9d934732977f520b1b6e453669a` |

The snapshot was captured on 8 October. The first migration creates the original read projection; the second moves it into the private schema and hardens access. Preserve both in their original order. No CIGO application code or separate CIGO repository is imported. Do not replay either migration on a database where its identity already exists.

The 8 October expanded native restore included `codeedge_internal`, restored all 79 table row counts and matched six schema/security fingerprints. An isolated rehearsal of the WhatsApp suffix passed 11 WhatsApp cases and nine general tenant cases, preserved CIGO functions and all original table counts, and retained forced RLS on all 40 public tables. Fixtures were rolled back and no provider was contacted. Encrypted recovery artifacts remain outside Git and depend on the original Windows account.

On 29 October the Supabase test project `kffcywicqrtxdwgyvhvk` was INACTIVE. Its resume request was accepted and the latest observed state was COMING_UP. The current hosted ledger could not be revalidated while inactive. The local migration record is not a claim of current hosted parity.

## Remaining release work

1. Finish database startup, recheck the actual ledger/definitions, obtain a fresh verified backup and apply only a genuinely missing migration suffix under the existing runbook.
2. Require green CI on the final update; verify the exact Preview's configuration and authenticated settings/inbox behavior. Keep automatic transport disabled until the Meta test-number flow passes.
3. Complete owner Meta developer access, app and WhatsApp test-number setup, tenant-bound server credentials and signed webhook subscription. Test inbound/reply/delivery/duplicate/handoff behavior against Meta's test number.
4. Verify number coexistence eligibility before onboarding the existing WhatsApp Business app number. Leave the real number untouched until that gate is satisfied.

The separate `engineering/whatsapp-auto-reply-draft-gate` branch contains draft-only work and is not a descendant of this feature head. It has not been merged into this PR; review its intended release relationship before combining policies.

See [the next owner action](WHATSAPP-META-OWNER-SETUP.md). App Secret and access tokens belong only in server environment variables; never request them in chat, source or GitHub.

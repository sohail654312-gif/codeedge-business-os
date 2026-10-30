# Business OS commercial completion and acceptance (2026-10-30)

**Status: NOT CERTIFIED FOR A LIVE COMMERCIAL PILOT.** This work is a source-only, read-only acceptance mechanism. It does not change the already merged V1, authorize production, resolve any provider issue, or imply that a green Vercel build is a live WhatsApp/voice connection.

## Two separate promises

1. **Client demo:** a complete, repeatable, explicitly simulated demo using fictional clinic and UK-trades workspaces. Show live CRM/booking/UI behaviour, but make synthetic calls, messages, finance and AI results unmistakable. All D01–D05 must have fresh exact-release evidence.
2. **Paid client pilot:** genuine approved business identities, connected providers, operational scheduling/recovery, access controls and release rollback. ALL demo and P01–P11 gates must have reviewed evidence.

The original **Business OS V1 shipped on 6 October 2026** (merged [PR #77](https://github.com/sohail654312-gif/codeedge-business-os/pull/77)); it was not a promise of live WhatsApp, live telephony, unattended five-minute scheduling, or independent managed backup. Do not rewrite that historical release as unfinished just because commercial integrations remain.

## Read-only status gate

- Source of truth for pending work: `release/commercial-readiness.json`.
- Lint schema/evidence structure only: `node scripts/check-commercial-readiness.mjs --validate`. This MUST pass even when gates are incomplete.
- Check an honest demo readiness decision: `node scripts/check-commercial-readiness.mjs --mode demo`.
- Check paid-pilot readiness: `node scripts/check-commercial-readiness.mjs --mode pilot`.
- For machine-readable summary: add `--json`.
- Nonzero result (1): unaccepted gates. Nonzero result (2): malformed manifest. This script does not phone home, inspect secrets, mutate databases, touch providers or deploy anything.
- An acceptance entry requires a real artifact URL/repo path, date, exact commit SHA and accountable **human** reviewer. A syntactically valid evidence entry is **not independently authenticated by this script**; human review and fresh live tests remain mandatory.

## Verified reference points, not acceptance for this new release

- The released V1 and later performance changes were already merged on `main` (baseline `c705d2e2b2eb552015f79c412dce4d40e9bf1016`); V1 had tested CRM, Booking, Shared Inbox, Demo Voice/Money, permissions and responsive UI.
- Current Business OS staging project `kffcywicqrtxdwgyvhvk` was `ACTIVE_HEALTHY` at inspection. It has **33** applied migration identities (31 V1 + 2 historical CIGO) and **40/40 public tables with both enabled and forced RLS**; this is *not* a fresh PR #83 hosted migration-parity acceptance.
- Separate project named "CodeEdge Business OS" `ljniurodhvbvpcztwlnh` was **INACTIVE**. Its intended role is unverified. Do not activate, migrate or select it as production without owner approval.
- Latest WhatsApp PR #83 is draft/unmerged at `aefdaf540a0ad7b80baebc0c00b3171af6fff0c3`. Exact-head CI succeeded, its Vercel preview is READY, but the provider-health check said `not_configured` and live Meta test-number connectivity is unverified.
- Draft PR #84 includes opt-in, default-off reply suggestions and must be reviewed for compatibility with PR #83; do not blindly merge or enable outgoing auto-replies.
- The test Vercel project is SSO-protected. A READY deployment or HTTP 200 from generic configuration health is **not** a provider integration test.
- Supabase security advisors warn about four authenticated-callable SECURITY DEFINER booking/Demo Voice RPCs. Source inspection shows active membership/Demo-only checks; genuine signed cross-tenant negative tests and a qualified security review are still required. Do not disable those functions or widen grants to dismiss an advisory.

## Recommended execution order

| Phase | Gates | Work and stop condition |
|---|---|---|
| 1 — Demo acceptance | D01–D05 | Reproducible fictional tenants, CRM/Booking/Chat/Money/Voice simulation, real browser QA, denial cases; no external effects |
| 2 — Release and tenant boundary | P01–P02, P09 | Reconcile the two draft WhatsApp branches, exact-head CI, review applied migrations and verified backup; owner selects intended production environment |
| 3 — Real providers | P03–P05 | Owner authorizes Meta developer app/test number, telephony and sender credentials in official providers; verify signed webhooks, voice takeovers, recovery; never expose secrets in Git/chat |
| 4 — Operations | P06–P08, P10 | Scheduler/heartbeat, offsite backup/restore, delivered alerts, privacy/retention, spend policy |
| 5 — Client pilot | P11 | Approved pilot, replayable negative tests, verified rollback and user signoff; merge/release only with owner approval |

**Immediate dependency:** Owner signs into https://developers.facebook.com/apps using the portfolio-owning Meta account, then reports only "signed in" (plus optional non-secret App ID). Never share OTPs/tokens/secrets. Existing phone/WhatsApp Business data must remain untouched until coexistence eligibility is verified.

**Owner governance:** No automatic merge, new Supabase project, paid plan upgrade, destructive migration, privileged role activation, prod alias change or live customer/provider traffic. Continue engineering on isolated branches and run source/CI/disposable tests; do not mark a gate accepted merely because tests pass.

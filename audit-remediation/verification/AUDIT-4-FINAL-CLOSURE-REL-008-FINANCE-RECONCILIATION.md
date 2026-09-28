# Audit 4 Final Closure — REL-008 Ambiguous Finance Reconciliation

Status: **PARTIAL — ambiguity capture + operator visibility implemented; live provider reconciliation proof remains**

Repository baseline before this continuation:

`e7511e80d99a3eb6276091fd2f8cab00bf27aded`

## Existing safety behavior verified

Production Finance writes already use:

- unique request IDs;
- a persisted Finance execution record prepared before provider execution;
- a 10-second ERPNext request timeout;
- ambiguous classification for network/timeout and provider 5xx outcomes where Codeedge
  cannot prove whether a write reached the provider;
- no automatic retry when an existing request is `prepared` or `ambiguous`;
- an explicit error when a provider may have succeeded but Codeedge cannot persist the
  success result safely.

This prevents a normal retry path from silently duplicating an uncertain external
Finance write.

## Live hosted state

Read-only hosted verification returned:

- total Finance execution records: **0**
- prepared: **0**
- ambiguous: **0**
- failed: **0**
- succeeded: **0**
- simulated: **0**

There is therefore no real ambiguous provider record available to reconcile during
this audit without deliberately creating an external provider effect, which is outside
the safe Audit 4 scope.

## Reconciliation visibility added

Codeedge Money now includes a read-only **Finance reconciliation queue**.

The query is:

- tenant scoped by `business_id`;
- restricted to `status = 'ambiguous'`;
- ordered newest first;
- bounded to 50 records;
- protected by the existing forced-RLS Finance execution policy.

For each ambiguous execution the UI exposes non-secret operational evidence including:

- engine;
- operation;
- document type;
- Codeedge reference;
- external reference when known;
- request ID;
- safe error code;
- creation/completion timestamp.

The UI explicitly tells the operator to verify the provider record before any
follow-up action and states that Codeedge does not automatically retry ambiguous
writes.

## What is intentionally not implemented

This continuation does **not** add a button that blindly changes an ambiguous record to
succeeded/failed.

A safe final resolution requires provider-side evidence (for example an ERPNext
document/reference or a verified absence of the attempted write). Automatically
changing the local status without that evidence would defeat the purpose of the
ambiguous state.

## REL-008 status

REL-008 remains:

**REMEDIATED IN CODE / OPERATIONS PARTIAL**

Improved evidence now includes:

- explicit timeout;
- ambiguous outcome classification;
- retry suppression;
- persisted execution identity;
- read-only tenant-safe reconciliation queue;
- current hosted ambiguous count = 0.

Final operational closure still requires a controlled staging/provider reconciliation
exercise using a sandbox/test provider or a naturally occurring ambiguous test record,
then recording the provider evidence and resolution path.

## Safety

No provider request was made.
No Finance execution record was created or modified.
No database schema/data mutation was performed.
No production or MVP resource was changed.

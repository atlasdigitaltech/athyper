# Business Partner 360 P1 release-environment qualification

**Evidence date:** 2026-08-30  
**Decision:** **Blocked — no qualifying release environment or accountable approvals are recorded**

## Qualification control

The normative P1 state is retained in
`docs/architecture/evidence/business-partner-360-p1-qualification.json`. The
evaluator is `server/db/scripts/evaluate-business-partner-360-p1-qualification.ts`.
It requires all nine technical evidence records, the five owning-domain
provider dispositions, measured browser/performance data, manual accessibility
certification, a delivered and acknowledged non-production notification, and
all eight accountable release approvals.

The evaluator deliberately rejects these common false-positive states:

- an unnamed release environment or a non-durable deployment reference;
- a connected business-activity provider without an owning-team approval;
- fewer than ten authenticated BP360 browser cases, any skipped case, or fewer
  than all seven acceptance fixture families;
- absent or over-budget HTTP/browser measurements;
- automation presented as manual accessibility certification;
- synthetic route resolution presented as notification delivery; and
- missing, duplicate or malformed release approvals.

Run it with:

```sh
pnpm --filter @athyper/server-db db:evaluate:neon:business-partner-360-p1
```

Add `-- --strict` in a promotion pipeline. The strict form exits non-zero until
`releaseReady` is true.

## Environment inspection result

The running local dev and QA stacks were inspected without exposing secret
values. Both API containers are healthy, but neither advertises the BP360 MESH
live URL, BP360 MESH credential reference, or a configured protected-value
secret-store boundary. Their API containers therefore cannot be treated as the
requested release integration environment. Healthy local IAM, object-storage,
STUDIO and MESH web containers do not prove the production integration
contracts by themselves.

The P1 packet consequently leaves `environmentRef` null. That is an explicit
invalid condition rather than an inferred deployment approval.

## Current result

The evaluator currently reports:

- `qualificationComplete: false`;
- `approvalsComplete: false`;
- `releaseReady: false`;
- eight pending technical workstreams;
- eight pending accountable approvals; and
- `RELEASE_ENVIRONMENT_INVALID`.

`provider_authority` is the one passed P1 workstream. Procurement, finance,
sales, projects and contracts all remain explicitly `not_configured` with
`PROVIDER_NOT_CONFIGURED`. This is compliant because no undocumented reader was
connected. It does not mean that any owning provider has approved or supplied a
reader.

## Evidence capture procedure

1. Assign the release non-production deployment and set a durable
   `environmentRef` in the packet. Deploy secret-store, object-store signer and
   independent MESH references through the approved environment mechanism; do
   not store secret values in the packet.
2. Change an integration evidence status to `passed` only after its retained
   evidence proves protected-value reveal, signed-link expiry, all required
   MESH outcomes, or STUDIO process restart/failover against that deployment.
3. A provider may change from `not_configured` to `connected` only with a
   durable `ownerApprovalRef`. Otherwise retain the exact
   `PROVIDER_NOT_CONFIGURED` failure contract.
4. Record the authenticated executed/skipped counts and all seven fixture
   families. Populate performance measurements from the same release
   environment. The evaluator enforces the six Phase 1 budgets.
5. Record supported browsers and each manual accessibility result only after
   the named assessor completes the screen-reader, keyboard/focus, 200% reflow,
   responsive, localization and RTL campaign.
6. Record a non-secret sink reference, delivery/acknowledgement timestamps and
   at least two supervised exercise participants only after real
   non-production delivery and acknowledgement.
7. Replace pending release approvals only from accountable owner decisions
   with durable evidence references. Repository automation cannot approve a
   gate.
8. Re-run the evaluator in strict mode. A true result is necessary but does not
   itself authorize canary; P0 must also be closed and the rollout controller
   remains separately gated.

## Repository verification

On 2026-08-30:

- the P1 evaluator tests passed: 3 of 3;
- the database/static suite passed: 192 of 192;
- the focused production-integration and release-gate service tests passed:
  9 of 9; and
- the browser command discovered ten desktop/mobile cases and skipped all ten
  because authenticated release coordinates were unavailable. Skips remain
  pending evidence, not passes.


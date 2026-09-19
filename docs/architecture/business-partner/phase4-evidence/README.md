# Phase 4 — publication and proof

## Status

Implementation is available; the live exit condition is **not complete**. No draft was submitted, approved or published during this task. No permissions were changed.

## Delivered

- Existing validation, contract tests, submit, independent approval and publish controls use shared UI buttons. Rejection is now available for an in-review revision.
- Inspection preserves the server-supplied author, submitter and reviewer/approver identities and displays them with the saved revision and change-set ID.
- Server review separation was checked: authors and submitters cannot approve their own change set. Exact expectedRevision is forwarded to the repository lifecycle transition; conflict errors remain failures.
- Successful publication now rereads the returned immutable release and checks its originating change set, signed artifact contract hash and exact target set before selecting it.
- An uncertain publication outcome blocks commands. Reload reconciles the durable release list and rereads a matching release instead of reposting. Ambiguous/malformed results remain blocked.
- Activation confirmation requires matching source release, contract hash, target contract/source hashes, descriptor hash and applied-release identity. Duplicate target evidence is not trusted. Failed refreshes clear confirmation.
- Session, assurance, independent-review and conflict errors have distinct explanations when the API supplies the relevant problem code.
- The read-only Neon verifier now checks the stored surface/field label, matching tenant, exact active release, and the application descriptor response actually consumed by the browser. Its descriptor hash must match activation evidence. A local graph preview cannot qualify merely by displaying the expected label.
- Verification captures the visible choice-card field and screenshot, brackets the observation with activation reads, and emits version 2 evidence with release/hash/tenant/surface/field/time coordinates. Other control types fail explicitly.
- The release panel accepts a local evidence JSON file and checks its coordinates and stored label against current activation. A refreshed, changed activation invalidates the match. Files are unsigned local observations, explicitly not durable approval/deployment receipts.

## Verification

- 25 focused frontend tests passed (workbench publication, proof matching, inspection, editor and composition editing).
- 4 focused backend tests passed (independent review and inspection routes).
- Product package and Studio application typechecks passed; diff whitespace check passed.
- Fixture-backed browser checks passed for importing a matching observation, invalidation after activation changes, and 390px width without horizontal overflow. No authoring writes or page JavaScript errors occurred. Screenshots and the reproducible browser-check.cjs are included. Their fixture success is **not** live publication evidence.

## Live findings

- Both saved Studio accounts (`catl.admin`, `catl.owner`) and the Neon admin session are authenticated and elevated.
- Studio admin can read the working draft. Both Studio accounts receive HTTP 403 `missing_permission` from the activation endpoint. The endpoint requires `publication.deployment.view`.
- The existing selected release `c2cc6900-26c1-47ca-8dfc-1d488000950c` does not contain the requested `intake_partner / requested_role` label. The strengthened verifier rejected it before attempting to claim visibility.
- See live-status.json, owner-activation.json, and live-check/evidence.json. The failed observation is deliberately retained as failure evidence.

## Remaining gates

1. Have an authorized deployment observer read activation evidence using `publication.deployment.view`.
2. Review the intended saved change and use an independent human reviewer to approve that exact revision; then publish the chosen targets through the existing workflow.
3. Run the verifier for the returned release and the actual intended label. Retain its screenshot and import its evidence file into the release panel.
4. Confirm matching active release and visible label. Only then is Phase 4's live exit condition satisfied.

The existing backend chooses target planes at publication, not at approval; the panel states that limitation. Target-bound approval would require an explicit persisted backend contract and is not simulated here. Durable storage/signing of browser observations is also outside this increment.

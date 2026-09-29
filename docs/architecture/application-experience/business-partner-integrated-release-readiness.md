# Business Partner integrated release readiness

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

2026-09-21 checkpoint: the scoped Studio capability and Neon collaboration DDL
upgrades are applied and verified in DEV, and the workspace build passes. Native
intake/provider/envelope publication remains incomplete. See the
[integration evidence](../../reports/bp-integration-20260921/README.md).

This gate is separate from BP2-01. BP2-01 provides authoring sources and the shared-reference lookup contract; this document governs a dependency-complete DEVFULL release containing the selected Intake, Comments, Attachments, and BP2 work.

## Current build evidence

- `python3 tooling/scripts/metadata/validate.py` validates authoring input by materializing compiler-owned hashes in memory. It does not require or write `artifactHash` in new source files.
- `python3 tooling/scripts/metadata/validate.py --release-ready` must fail until one signed release envelope covers every compiled artifact and every required permission and provider has live publication evidence.
- `python3 tooling/scripts/metadata/verify_bp_release_schema.py` is a read-only preflight for `metadata.entity_capability` in Studio and `document.comment_revision` in Neon. It refuses to assert readiness without both target URLs and never applies DDL.

## Release order

1. **Freeze scope and owners.** Record the exact artifacts, native intake surfaces, provider registrations, DDL sources, and permissions. Source work remains editable until this point.
2. **Compose and test the generic intake route.** Register only the `business_partner` / `business_partner_intake` provider. The mapper must resolve the published descriptor server-side, verify its hash, accept only declared field paths, and convert answers to governed commands. It must not accept a browser-selected provider, role, context, extension, or policy outcome.
3. **Publish native Studio intake surfaces.** Publish `intake_partner`, `intake_details`, and `intake_review` together with their flow. Verify the active Studio receipt before enabling the browser journey.
4. **Apply DDL through the controlled migration process.** First run the read-only preflight. Apply the already-reviewed Studio metadata order (`03_tables`, `05_constraints`, `10_rls`, `11_grants`) and Neon collaboration order (`03_foundation_tables`, `12_collaboration_integrity`) in a data-preserving transaction-aware release process. Capture catalog receipts and run the collaboration and capability integration tests. Do not use a fresh-install script as an upgrade script.
5. **Build and sign the release envelope.** Compile sources, generate immutable hashes and the envelope from compiler output, include every artifact, sign it, then run `validate.py --release-ready`.
6. **Publish and verify.** Publish once the whole dependency graph is ready. Retain Neon and Studio activation receipts, then exercise create, draft, edit, submit, comment, attachment, context-required, and reference lookup journeys against the activated release.

## Explicitly deferred work

Country/state consumers belong to BP2-02, classification consumers to BP2-05, and banking-directory consumers to BP2-09. Their absence from a current BP2-01 consumer does not block that feature; it does block any release that declares those consumers in its frozen scope.

## Acceptance record

A release is eligible only when all of the following are attached to its change record:

- source and compiled validation receipts;
- a signed, complete release envelope;
- Studio and Neon schema preflight and post-apply receipts;
- native intake surface activation receipt;
- provider and permission publication evidence;
- browser/API journey evidence for each included capability.

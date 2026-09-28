# Common collaboration capability boundary

## Implemented contract

`common.platform.reference.view` remains an exact read-only exception. Its graph
and descriptor validators are unchanged. Reference operations remain list/read/view;
reference fields cannot acquire writable paths from collaboration enrollment.

The sibling `common-capability-permissions.ts` admits only these tuples:

| Kind | Action keys | Permission prefix | Handler prefix |
| --- | --- | --- | --- |
| comments | read, create, update_own, archive_own | common.collaboration.comment | platform.comments |
| attachments | read, create, finalize, download, archive | common.collaboration.attachment | platform.attachments |

Permission is `<prefix>.<action>` and handler is `<prefix>.<action>.v1`.
Unknown common codes, using a read permission for a write, crossing capability
kinds, and using entity-mutation handlers are rejected. Parsing enforces this even
without a registry. Compiled-artifact qualification still requires the permission,
action handler, service and admission resolver in the supplied registry. Existing
same-plane immutable policy dependencies remain enforced.

This is **not** a runtime grant, an SQL privilege, or a universal common-namespace
exception. Other IAM/staging validators have not been broadened. Capability actions
must remain distinct from the reference operation projection; trace their actual
publication/staging consumers before changing SQL admission.

## Country authoring candidate

`metadata/products/shared/entities/country/capabilities.json` is declarative source,
loaded by Country's existing provisioning candidate. The shared-reference builder
accepts optional capability members without merging them into reference operations.
Studio validates and hashes these through the existing capability-member pipeline.

Initial defaults: private comments (public-to-authorized-record-readers is also
allowed), no replies/mentions/reactions, own edit/archive, up to three 5 MiB files,
PDF/PNG/JPEG/plain text, mandatory scanning, authorized short-lived downloads,
association-only unlink, no automatic extraction/search/preview processing.
"Public" here is not anonymous or cross-tenant access.

These defaults are candidate policy, not a claim of production approval. File
finalization must remain unavailable if scanning or required storage is unavailable.
No expiry/retention policy is invented; operational retention must be resolved
through existing document policy before live qualification.

The preparation output lists all nine capability permission requirements separately
and explicitly says `requires_signed_split_artifacts`. The native read descriptor
alone is not a complete collaboration publication.

## Checkpoint: 2026-09-26

Fresh results:

| Package | Typecheck | Tests |
| --- | --- | --- |
| Publication contracts | Pass, including tests | 59 passed |
| Studio authoring | Pass, including tests | 143 passed |
| Publication service | Pass, including tests | 270 passed |
| Platform host | One existing preflight repository import error | 532 passed, 25 skipped |

New tests cover all nine exact tuples, malformed common tuples without a registry,
three-plane registry qualification, missing permissions/handlers, three-plane
Country graph compilation, and unchanged reference read operations. An AST guard
keeps the common vocabulary module dependency-free. Existing reference negative
tests remain green. These are not live collaboration/RLS acceptance results.

Country candidate preparation succeeds for Studio, Neon and Mesh. Live Studio
still has zero Country authoring rows and no applied Country release at this
checkpoint. No DDL, grants, memberships, approvals or releases were changed in this
implementation slice. The prior Neon arrangement-table fix is separate.

## Remaining gates — manual Country acceptance is NOT ready

The subsequent [Phase 1 foundation record](../runbooks/reference-entity-foundation-phase1.md)
defines DEV machine-authorization and onboarding-template authority. Engineering
does not wait for a named production approver; security-sensitive activation still
requires the applicable authority. The checkpoint counts above remain historical.

1. Complete trusted system-reference authoring and compilation-source integration.
   Self-service tenant/overlay registration must not be loosened as a shortcut.
2. Qualify shared-parent admission from the signed reference contract, including
   actual record existence, current tenant context and parent read authorization.
   Do not register an unconditional parent resolver.
3. Complete common permission catalog and base-role/template publication and
   tenant/plane-local assignments through the existing authorization workflow.
4. Implement the reviewed DEV policy and independent onboarding-template/release
   approval path as applicable. Do not reuse the older development publisher that
   fabricates development-only signature evidence.
5. Apply reviewed targeted DEV migrations, approve/sign/publish and verify real
   per-plane activation receipts. No direct runtime projection insertion.
6. Run authenticated list/detail, stable sort/paging, denied mutation/access,
   two-tenant comments/files, ownership/audience, upload/scan/download, revocation
   and withdrawal/rollback checks. Keep all skipped integration suites explicit.

Then issue a manual handover with live URLs, permitted test accounts/roles,
release identifiers and exact verification results. Currency remains deferred.

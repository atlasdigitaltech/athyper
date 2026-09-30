# Approved reset catalog installation — 11 September 2026

The conversation user explicitly approved the catalog review packet. Approval was recorded as a conversation-user decision, not impersonated as an authenticated catl.owner or catl.admin review. Original proposal files and release-20 approval evidence remain unchanged.

Installed:

- Shared DEV Studio (`athyper_studio`): `metadata.entity.author`, `validate`, `test`, `submit`, `review`, `publish`. All require MFA, use exact tenant scope, and prohibit sharing, delegation and override. Review/publish also require separation of duties.
- Isolated release-20 clone (`athyper_neon`): `collaboration.comment.read` and `document.attachment.read`, with the exact reviewed resource-scope conditions. These are source definitions, not aliases or new grants.

Both destination transactions passed fresh rollback rehearsals before either installation committed. The installer rejected existing definitions instead of overwriting or republishing them, verified active modules and the isolated clone network, and attached proposal/approval hashes to each new definition. The destinations committed independently; each committed result was recorded before subsequent verification.

Verification confirmed six and two definitions respectively, published status, unchanged non-catalog authorization fingerprints and unchanged activation-head fingerprints. Shared NEON's full authorization and activation fingerprints remained unchanged. A second installer invocation was rejected before mutation, preventing accidental replay.

Evidence:

- `governance/policy/reviews/business-partner-reset-catalog.acceptance.dev.json`
- `governance/policy/reports/business-partner-reset-catalog.installation.dev.json`
- Installer: `tooling/scripts/verification/install-business-partner-reset-catalog.mjs`

Catalog fingerprints have intentionally changed in Studio and the clone. This is not unexplained drift: the installation report records before/after table digests and the inserted definition IDs. Historical reset-baseline and dry-run files must not be overwritten to disguise this transition.

No roles, assignments, historical revoked grants, publication heads or enforcement selection changed. No signed release was amended. The source definitions can make target reads evaluable; live behavior must be recaptured against the reviewed successor catalog, not attributed retrospectively to release 20.

Fresh named authoring/qualification assignments, successor publication and signing, ownership/field journeys, compatible recovery and acceptance of the 66 dispositions remain separate work. This installation closes only the approved eight-definition catalog step.

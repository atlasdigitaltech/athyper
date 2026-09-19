# Business Partner UI test draft

Created through authenticated Studio authoring APIs as `catl.admin` on 2026-09-16.

- Draft: `782c6aba-e584-4519-b5f3-ca98f9caa380`, revision 1, branch `bp-ui-label-test`.
- Explicit content source: approved change set `be767e01-f36d-434f-91f3-67bff689a367`, revision 63. This is a named test copy, not a fork from a published release and not a publication successor.
- Source contains 158 fields and 23 surfaces. Source release 2 only contains 10 fields and a non-intake surface, so it is unsuitable for the intended full intake label test.
- Existing `local-preview` approved change set blocks the existing one-slot fork helper. Standard named draft creation and graph saving allow an isolated authoring copy without changing that approved record.
- Row identities cloned using the repository's `cloneGraphIds`. `identity-map.json` records lineage for this operation. Complete graph reread matched after sorting collections and resolving normalized test paths to stable identities.
- Server validation: zero issues. Three contract tests pass.
- Save activated the normal development preview for this draft. No submission, approval or publication occurred. Source approved revision/graph and source release list remained unchanged.
- Authenticated browser opened the linked draft and confirmed `draft · Editable draft`; see `workspace.png`.

## Begin the test

Open the URL in `receipt.json`. Select **Partner → Requested business role** (field placement), change its label or help text, inspect Preview and differences, then save and reload. The development preview may make saved changes visible in Neon; this is separate from governed publication.

Use this new draft directly. The old approved change set remains intentionally immutable; its generic fork action still does not create a successor. Publication recovery and broader multi-draft lifecycle remain separate work.

`receipt.json` records graph hashes, verification and preview coordinates. The operator script is `tooling/scripts/verification/prepare-business-partner-ui-test-draft.mts`; it defaults to read-only and requires `--apply` for mutations. It resumes this receipt rather than creating duplicates.

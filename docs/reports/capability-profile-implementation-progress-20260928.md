# Capability profile implementation progress — 2026-09-28

Status: signed Country successor release 5 published and activated on Studio,
Neon and Mesh. Signed-in application acceptance remains pending; this is not a
complete acceptance receipt for the seven-step rollout.

## Signed publication update — 2026-09-28

### Subsequent Neon signed-in acceptance

At 2026-09-27 19:41 UTC, the refreshed catl.admin Neon capture authenticated.
Comments and Attachments returned HTTP 200 against release 5. Projection confirms
Private default, 5000 text limit, 3 attachments/batch and 5242880-byte file limit,
despite the higher host ceiling (object-storage.max-upload-mb:100).

The live acceptance script passed comment creation, threaded reply, reaction,
history, PDF staging/upload/finalization, extraction, ready preview (delivery 200)
and content search matching the unique synthetic marker. Test records retained:

- Comment: 01a0e462-e848-7ce0-a928-ec74ae79371f (Private).
- Reply: 01a0e462-e8b6-7780-91b8-a79499a51b49 (Private).
- Attachment: ad422a46-5094-4a36-8a49-ac21afd79fc6,
  acceptance-ad422a46.pdf, 1415 bytes.
- Marker: COLLABACCEPTANCEFF97FA09724946C686B9A8DBEDFC6EA5.

This is API acceptance using the captured application session, not complete
interactive-browser or multi-user isolation acceptance. Mesh and Studio captures
still return anonymous and need refresh; no session was copied between planes.

Fresh platform.admin and platform.owner password + OTP sessions were independently
verified. The exact candidate was submitted and approved through the existing
control API, then executed using the existing two-credential workload endpoint.
The source control API, source application API and source worker were reloaded
with compatible code before publication execution. Initial submission returned
500 before control-service reload; resubmission succeeded without changing policy.

- Approved policy: 7c4d1243-bc81-4f4a-ad2c-786a3631bd56, version 1.
- Policy hash: ba0f190f6bd6d5a71139908092b898aa4e5802e1fdd2add52fe32dae0b95365f.
- Country release: 7e4f4208-da9b-44b9-bc0f-7160e39c3677, release number 5.
- All three heads independently verified at version 5, active, without failure.
- Each target reports manifest_valid, runtime_compatible and signature_verified
  true, using Ed25519 / athyper-publication-dev-signing-v1.

| Plane | Applied release | Activation time (UTC) |
| --- | --- | --- |
| Studio | 01a0e45b-393c-7ba3-8274-8e37f5718b02 | 2026-09-27 19:32:58.842662 |
| Neon | 01a0e45b-373e-711a-8fde-31c093542df8 | 2026-09-27 19:32:58.336215 |
| Mesh | 01a0e45b-397c-728e-98f7-965b76817a89 | 2026-09-27 19:32:58.912567 |

Read-only application-session checks for saved catl.admin captures returned
anonymous on all three planes. Application acceptance requires refreshed captures;
platform-control MFA sessions are not application sessions and must not substitute
for them. No synthetic comments/uploads were created in this acceptance attempt.

The sections below retain the implementation and pre-publication checkpoint;
the activation/session status in this update supersedes their earlier status.

## Implemented and verified

- Source-only authoring mode guard, exported by the publication contract package.
  Conflicting/missing modes raise CAPABILITY_AUTHORING_MODE_CONFLICT before field
  validation; existing field checks retain ENTITY_CAPABILITY_INVALID.
- Guard applied at capability mapping and Studio graph validation boundaries.
- Typed profile source parsing, explicit override rules, safe nested-property
  handling, deterministic resolution, defensive copies and audience consistency.
- Comments and Attachments v1 source files and a byte-hash source lock.
- File-backed adapter rejects unknown versions, lock drift, duplicate identities
  and paths escaping the supplied source directory. It has no publication authority.
- Generic fixture tests exercise owner-independent default reuse and override
  isolation. These are source-resolution tests, not compiled-entity acceptance.
- Historical Country candidate tests explicitly reconstruct their Private default;
  existing expected reviewed hashes are unchanged. The newer Public source proposal
  is not folded into the historical baseline or silently activated.

Verification at this checkpoint:

- Publication contracts: 165 tests passed.
- Studio authoring: 208 tests passed.
- Both packages' source/test typechecks passed.
- git diff --check passed.

## Additional implementation completed

- Existing Studio entity_capability storage and repository now support profile,
  profile_definition and overrides. The reviewed snapshot participates in the
  authoring contract hash; compilation never rereads mutable source files.
- Additive migration applied to the local Studio database. No new profile registry.
- Closed capability_profile artifact parser, graph extraction, target compilation,
  and compiler-generated profilePolicy references using the existing hash/plane/key
  shape. Operation dependencies explicitly include the profile artifacts.
- Validation checks profile kind, owner, plane, hash, dependency membership and
  permitted effective overrides. Runtime operation reads reuse this validator for
  cold and cached artifacts, against the pinned release manifest.
- One server effective-controls resolver supplies minimum ceilings, allow-list
  intersections and feature restriction; scanning is preserved. Enforcement and
  browser projection share the result, configuration revision and release hash.
- Host wiring supplies the existing infrastructure upload ceiling. Existing
  attachment admission rechecks uploads/versions/finalization; tighter upload
  limits do not block downloading an existing authorized file.
- Draft-only adoption utility and successor preparation flag compare every enabled
  binding before/after; any effective behavior difference fails closed.

## Country draft prepared, not approved

Active Country publication remains release 4:
2ce95226-0b30-4137-aaa0-3594ec946547.
New draft change set: 9758c69e-142a-4524-ba59-be9afe350d59.

Dry-run and persisted preparation compile the graph against the baseline targets
and verify identical effective capability behavior. Private, limits and action
concurrency/idempotency settings remain unchanged. Explicit targets are Studio,
Neon and Mesh, each with its own predecessor pin.

No approval or signed release was created; no activation head changed. No BP
metadata was restored and no business data or signed payload was edited.

- [Baseline](capability-profile-successor-baseline-20260928.json)
- [Draft preparation receipt](capability-profile-successor-draft-20260928.json)
- [Unsigned policy candidate](capability-profile-successor-policy-candidate-20260928.json)

The candidate's compiler fingerprint is not an authorization grant. Regenerate and
review it after any covered source change.

## Additional verification

- Publication service: 344 tests passed, including Country/generic profile artifact
  fixtures on all three planes and invalid-pin cases.
- Platform experience: 153 tests passed.
- Attachment service: 93 tests passed.
- Host focused admission/qualification/registry suite: 30 tests passed.
- Platform metadata: 83 tests passed, 2 skipped, including six runtime pin tests.
- Contracts, Studio authoring, publication service and metadata source/test
  typechecks passed. Experience source and host typechecks passed.

Synthetic artifact fixtures are not target deployment receipts.

## Remaining gates and limits

Both saved platform.admin and platform.owner control sessions returned HTTP 401.
Fresh authenticated sessions are required for the existing author/approver workflow.
Do not bypass approval, compiler identity, signatures or target receipts.

After approval: deploy compatible readers, execute the governed successor workflow,
verify independent activation receipts on all three planes, then perform signed-in
Comments/Files, preview, search, draft/upload and tenant-isolation acceptance.

Operational controls currently use the host upload ceiling; no new mutable
parameter catalog or profile UI is introduced. The resolver accepts other trusted
restrictions, but they are not independently configured by this rollout. Batch
limits constrain declared batches and the projected UI; existing single-file
endpoints do not provide a cross-request batch/session counter. This is not a new
concurrent-upload quota guarantee.

Wider entity onboarding remains gated on the full acceptance matrix in the
[design](../architecture/application-experience/capability-profiles-and-runtime-controls-design.md).

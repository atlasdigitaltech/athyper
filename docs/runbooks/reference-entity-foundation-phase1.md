# Shared-reference delivery: Phase 1 foundation record

Recorded 2026-09-26, live inventory checked at approximately 09:58 UTC.

## Status and authority

The user accepted the implementation plan and authorized Phase 1. This record
captures the engineering baseline and foundation rules. It is not a persisted
Studio approval, a machine publication decision, a permission grant, or authority
to impersonate an approver. No runtime, DDL, credentials, grants, memberships or
active releases were changed in this phase.

Country is the first acceptance entity; Currency follows after Country acceptance.
DEV only. No isolated database, QA changes or production access were used.

Standing principles:

- A signed artifact is not a permission grant.
- A permission grant is not publication approval.
- A successful compile is not runtime qualification.
- Denying unresolved functionality is safe, but does not make it complete.

## 1. Fresh DEV inventory

Queries ran in `BEGIN READ ONLY` transactions through `athyper-dev-db-1`.

| Observation | Studio | Neon | Mesh |
| --- | --- | --- | --- |
| Database | athyper_studio | athyper_neon | athyper_mesh |
| Configured database plane | studio | neon | mesh |
| `shared.country` rows | 247 | 247 | 247 |
| `common.platform.reference.view` / `common.collaboration.*` rows in `authz.permission` | None | None | None |
| Applied releases matching Country publication key | 0 | 0 | 0 |
| `platform.release.approvers` groups | 0 | 0 | 0 |

Studio has zero Country rows in `metadata.entity`. The release inventory used
`publication_key LIKE '%country%'`; it is not an exhaustive content scan of every
historical bundle that might embed a Country dependency.

Each plane contains these active tenant records:

| Tenant code | Rollout treatment |
| --- | --- |
| athyper | In requested all-tenant scope; enumerate actual memberships and assignments before granting |
| cirrusatlantic | In requested all-tenant scope; enumerate actual memberships and assignments before granting |
| technostat | In requested all-tenant scope; enumerate actual memberships and assignments before granting |
| system | In scope for inventory; technical tenant membership/authority requires explicit treatment, not ordinary-user default grants |

This is a tenant-code inventory, not a deployment manifest. Resolve and record exact
tenant IDs, role IDs, eligible principals and target coordinates before writes.
Future tenant baseline provisioning must follow the same reviewed policy. A shared
permission name never replaces plane membership or tenant-scoped authorization.

At inspection the DEV source API and all three source web containers were healthy.
DEV source worker and scheduler were exited. No process was started. Container
health does not establish authenticated home, Country or collaboration behavior.

The earlier test counts in `common-collaboration-capabilities.md` are historical;
no package compilation or test suite was rerun for this documentation-only phase.

## 2. Foundation decisions for implementation

| Area | Rule to implement | Activation prerequisite |
| --- | --- | --- |
| Reference permission | Exact `common.platform.reference.view`; read-only, public, explicitly enrolled reference entities | Published catalog identity and approved local role assignments |
| Collaboration permissions | Four exact comment actions and five exact attachment actions; separate from reference operations | Catalog, handler and parent admission qualification |
| Base roles/personas | Reusable role bundles; seven persona templates are assignment aids, not authorization claims | Publish actual roles and scoped assignments through existing IAM workflow |
| Reference parent | Global physical row; actual existence and authorized read required | Concrete metadata-driven parent provider; never an unconditional resolver |
| Collaboration storage | Tenant-local comments and file associations, even for the same Country UUID | Two-tenant live authorization/RLS verification |
| DEV publication | Deterministic structural allowlist; machine decisions distinct from human approval | Reviewed policy, trusted target enrollment, durable evidence and qualified signing |
| First publication | Reviewed release or exact approved onboarding template | Template/version/hash and current authority verified |
| Schema | Targeted upgrade, separate from metadata activation | Schema ownership and existing storage suitability checked before additional DDL |
| Production emergency path | Governed, scoped, expiring, attributable; no integrity bypass | Pre-PROD dependency, not a Country DEV blocker |

Country capability source currently selects private comments by default, permits
public-to-authorized-readers and private audiences, own edit/archive, no replies,
mentions/reactions, and a three-file limit with 5 MiB per file. Allowed media are
PDF, PNG, JPEG and plain text. Scanning is mandatory; download URLs must be
authorized and short-lived. Extraction, indexing and preview processing are off.
Archive is association-only, not permission to delete another entity's document.
Retention and scanner/worker readiness still require explicit qualification.

These source defaults are implementation inputs, not evidence that a live policy
or grant has been approved. Security-policy changes do not qualify as cosmetic
reference updates.

## 3. Onboarding-template approval authority

An onboarding template must be approved by a principal with **current, scoped
publication-policy approval authority covering the security domain**, independent
of its author. The platform publication-policy owner is accountable for that
approval; relevant data/capability owners review the storage and disclosure rules.
No personal username is hardcoded into this mechanism.

`platform.release.approvers` is a proposed assignment group, not an approval by
itself. Group membership must resolve to the applicable permission and scope.
If that authority is absent, template approval is unavailable; an ordinary entity
publisher cannot approve the template to bypass first-release review.

Approval binds the template hash/version, policy hash/version, allowed storage and
data classifications, permissions, capability constraints and eligible target
classes. Expanding those constraints or changing template content requires new
review. Each automatic first publication must record the exact template approval
it used and recheck its current validity. A name or `approved: true` in a metadata
file is never sufficient evidence.

Engineering work on classification, publication integration and parent admission
does not wait for this authority to be assigned. Actual template use does.

## 4. Evidence-storage inventory: reuse assessment first

Fresh schema inspection found existing fields:

| Existing location | Potential relevance | Not yet established |
| --- | --- | --- |
| `publication.release.metadata` | Release-associated structured metadata | Whether authority and immutability rules permit a canonical decision receipt |
| `publication.release.approved_at/approved_by` | Existing approval attribution | Must not silently represent machine authorization as human approval |
| `publication.deployment_event.evidence` | Deployment event evidence | Whether lifecycle/write ownership fits pre-signing decisions |
| `publication.deployment_acknowledgement.evidence` | Target acknowledgement evidence | Not automatically a source approval record |
| `runtime_meta.applied_release.verification_evidence` | Target verification evidence | Verification is not publication authorization |
| `runtime_meta.release_activation_event.evidence` | Activation trace | Cannot substitute for a missing source decision |

Follow-up must inspect repository writes, database functions, RLS, mutation rules,
hash/signature binding, retry/idempotency behavior and consumers. JSONB availability
alone is insufficient. No new table is approved or required by this inventory.

Do not reuse the BP decision packet or its Neon receipt prefix. The generic DEV
decision remains a distinct versioned evidence contract. Preserve historical
readers and hashes for existing consumers.

## 5. Signing boundary

The current `CachedPublicationKeyResolver` selects configured key IDs and secret
references; the inspected configuration interface does not itself express a trust
domain. It rejects unknown IDs and duplicate IDs. This does not establish that
DEV/PROD currently have cryptographically separate key material or trust stores.

Before enabling automation, verify separate key material, separate verifier trust,
and secret access policies that prevent the DEV publisher from using production
keys. Key aliases resolving to the same key are not separation. Retain target,
expiry, current authority and evidence checks in addition to cryptographic isolation.
No secret values were retrieved in this phase; deployed trust separation is unverified.

## 6. Source anchors and folder ownership

Source fingerprints (SHA-256; working tree, not a release):

| File | Hash |
| --- | --- |
| `server/packages/contracts/metadata/src/common-reference-permission.ts` | ff1d69b07d0963bc987a4037aaff21ffa8de47486fa7bdbcb12ccb515b4a77b3 |
| `server/packages/contracts/publication/src/common-capability-permissions.ts` | ffe0446826763c6590b9ab3fbd0fcfbc10ac958c07651eb8c9d0864d1c836510 |
| `metadata/entities/country/capabilities.json` | 40928c66493d7529ec6246bbf794e7e9de6e6a06646827eaa16ccc2c27b514c7 |

The worktree contained 538 short-status entries at inspection. That count is not a
file ownership claim; existing unrelated edits must be preserved.

Approved destination discipline for subsequent work:

- Contracts: `server/packages/contracts/publication/src/policy/` and sibling `evidence/`.
- Pure classification/orchestration: `server/packages/services/publication/src/shared/policy/`.
- Reference compilation integration: `server/packages/services/publication/src/shared/reference/`.
- Signing trust: `server/packages/adapters/publication-signing/src/trust/`.
- Studio reference authoring: `server/packages/planes/studio/meta-entity-authoring/src/reference/`.
- Generic parent qualification: `server/packages/services/records/src/reference/`.
- Thin host construction: `server/apps/platform-host/src/composition/shared/publication/`.
- Entity declarations only: `metadata/entities/<entity>/`.
- Operational entrypoints: `server/db/scripts/operations/publication/`.

Paths above are proposed destinations relative to the repository root.
No folder was created or relocated simply to match this diagram.
Every extraction needs AST/import-boundary coverage and consumer migration.
Entity-specific names are allowed in metadata and fixtures, not executable runtime
branches. Such tests detect specified violations; they are not a proof of universal
genericness. Currency acceptance remains a separate reuse check.

## 7. Next boundary and handover limits

The subsequent [assessment-only implementation](../contracts/dev-publication-policy.md)
adds versioned policy/evidence contracts and structural classification. It does not
implement or enable the authorization/activation gates listed below.

Proceed to versioned policy/evidence contracts and the deny-by-default structural
classifier. Initially run classification without authorizing or activating releases.
Unknown changes and absent baselines require review. In parallel workstreams when
scheduled, complete persisted publication-source integration and generic parent
qualification; neither is blocked by an unassigned production approver.

Before DEV activation: resolve policy/template authority, target assignment details,
technical-tenant treatment, evidence storage semantics, independent keys/trust,
required schema upgrades, scanner/document readiness and retention behavior.

Before manual Country handover: verify authorized list/detail and collaboration,
not just denial; verify tenant/plane isolation, role revocation, and recovery.
Country is not published or ready for manual acceptance at this checkpoint.

# CA-01 / CA-02 implementation and local acceptance

Completed on 2026-09-21 against baseline `cb42abe05`. Scope: typed capability publication/runtime integration and fresh shared schema/history/reporting. This implements the foundations for the shared drawer/content experience; the drawer, coordination and richer workflows remain CA-06–CA-08.

## Contract and ownership decisions

| Concern                 | Implemented contract                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability availability | Core `capabilities.comments` / `capabilities.attachments`; absent means disabled. Disabled declarations accept only `enabled:false` and optional `reasonCode`.                                                                                                                      |
| Enabled declaration     | Required `enabled`, versioned `serviceKey`, matching `ownerEntityCode`, `load:"lazy"`; optional `includeInAggregateData` can only be `false`.                                                                                                                                       |
| Behavioral source       | Operation `commentBinding` / `attachmentBinding`, nested `schemaVersion:1`. All normative nested objects are closed. Superseded development binding shapes are rejected.                                                                                                            |
| Existing envelope       | Compiled artifact/release schema remains `2.0-draft`; actual admission still requires published artifacts and the existing verified/signature/activation path. The schema name alone does not grant runtime authority.                                                              |
| Studio                  | Graph schema remains `athyper.meta-entity-contract/2.1`, compiler is `1.1.0`. New optional `capabilities[]` persists as change-set-owned `metadata.entity_capability`.                                                                                                              |
| Required binding fields | Owner/service/admission resolver, layouts and typed actions, plus all kind-specific limits, feature switches and safety choices. Boolean switches are explicit; the compiler does not silently enable omitted features.                                                             |
| Optional references     | `retentionPolicy` and comment `audiencePolicy` use immutable artifact key/hash/plane references. They must match a same-plane member of the release and an Operation dependency. Absence retains existing service retention/hold behavior. Internal requires an audience reference. |
| Coupling                | Core enabled state, Operation binding, service/renderer registry, permission catalog, section owner, section action and dependency references must agree. Comment-file enablement requires an attachment capability and its explicit binding reference.                             |
| Browser                 | An allowlist projects layouts, permitted action keys, concurrency/idempotency requirements and effective limits. No handler keys, storage keys, raw policies or permission internals. Both surface kinds consume this contract.                                                     |

**Correction to CA-00:** existing `entity_operation` and `entity_policy_binding` rows do not preserve these typed capability declarations and full policies as a change-set member. Extending their unrelated JSON fields would create an unvalidated second source. The additive `entity_capability` member is therefore justified. The shared `capabilityArtifactMembers()` mapping feeds both native authoring compilation and split-artifact compilation; the latter rejects simultaneous authored Core/Operation copies. Change-set locking, draft capture, dependency inspection, graph guards and tenant RLS apply to the new member.

The reviewed Business Partner definition enables only implemented operations:

- Comments: read, create, edit own and archive own; public/private audiences and numeric edit concurrency.
- Attachments: read, stage/create, finalize, status and authorized download; mandatory scan, declared MIME/byte limits and no processing features.
- Attachment archive is deliberately absent: the existing delete service deactivates the object globally and does not implement association-only unlink.
- Replies, reactions, mentions, drafts, reporting/history UI, folders, rename, version management and processing are not advertised by this fixture. Their typed declarations require corresponding registered actions before publication.

Internal membership evaluation remains CA-03. Entity comment commands reject Internal until that evaluator exists; the generic reader does not disclose another author's Internal content. The current fixtures do not enable Internal. The runtime also enforces policy text/file bounds, audience/feature restrictions and thread-depth admission; existing quota and service ceilings remain authoritative.

## Runtime wiring

`createEntityCapabilityPolicy()` resolves the admitted Core and Operation, admits the parent through the published Records query service and checks canonical operation permission with verified tenant/principal/plane coordinates. Direct collaboration/attachment routes and `comments.*` / `attachments.*` runtime dispatch use this resolver. Capability sections retain the same resolved release as their presentation to avoid mixing two releases during a publication change.

The host recovers comment/attachment ownership server-side for existing resource IDs and verifies target ownership for generic dispatch. `content.item` and `atlas.prompt` retain their existing dedicated protocols; they are not newly enabled Entity App resources. Entity comment commands use their admitted canonical permission rather than additionally demanding a superseded generic permission name. A policy denial never falls back to the legacy permission path.

Upload intent stores admitted release/Operation hashes. Finalize resolves current admission and rejects a mismatched policy hash. This is intentionally conservative: a changed Operation definition requires a new admitted intent. Detailed uncertain-finalize recovery remains CA-04. Upload responses now expose attachment ID, signed upload URL and expiry without the raw storage key.

The current content renderer consumes the safe action projection before exposing create/edit/delete/upload/download controls. This is the CA-01 consumer update, not completion of the coordinated drawer workspace.

## Shared schema and writer decisions

| Model                        | Direct source change                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.comment`           | Required positive `revision_no`, starting at 1. All edit contracts use required positive `expectedRevision`, including the first edit.                                                                                                                                          |
| `document.comment_revision`  | Moved from Studio-only ownership into common DDL. Immutable snapshots include content, visibility, status and change kind. Unique `(tenant_id,comment_id,revision_no)` and compound comment/actor FKs.                                                                          |
| `document.attachment_series` | Nullable bounded `display_name` and positive `revision_no`; immutable original file names remain separate. Series promotion/rename behavior is CA-04.                                                                                                                           |
| `document.attachment`        | Paired admitted release/policy hashes and optional compound draft FK. Admitted owner coordinates/hashes cannot change. Scanned byte/version identity cannot change or be made mutable by clearing the scan flag; the existing sanctioned purge-key transition remains possible. |
| `document.attachment_link`   | Optional validated category code. Comment associations now pin the selected immutable attachment ID; existing tenant/series/pin FKs and unique association constraints remain authoritative.                                                                                    |
| `document.attachment_folder` | Existing owner/cycle guards retained; a record-local advisory lock serializes hierarchy changes before validation.                                                                                                                                                              |
| Reporting                    | Only `event.comment_flag` → `governance.comment_moderation`. Removed Studio `document.comment_moderation_flag` definitions, constraints, indexes, RLS and Prisma relations.                                                                                                     |
| Studio metadata              | `metadata.entity_capability` uses the existing change-set authoring role, RLS, graph guards, deferred validation and audit conventions.                                                                                                                                         |

The database trigger is the **single atomic revision writer**. A BEFORE trigger assigns the revision; an AFTER trigger inserts the snapshot in the comment command transaction, including rollback with failed downstream work. Application roles cannot append or modify history directly. Until CA-03 supplies additional admitted history readers, SQL history is author-only, tenant-scoped and unavailable after comment deletion. History endpoints are not enabled by the fixture.

All three manifests install shared integrity DDL. Fresh introspection updated the affected Prisma models and inverse relations; Kysely contracts were regenerated using the repository generator (generated output remains ignored under existing repository rules). No duplicate quota reservation or multipart structures were introduced. Existing seed ownership is unchanged; the new representative comment/file/report fixtures use the canonical schema directly and roll back. There are no backfills, upgrade migrations or compatibility readers.

## Focused verification

| Check                            | Result                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publication contracts            | 31 tests passed: positive/disabled definitions, safe layouts/projection, invalid normative fields/bounds/audiences/operations, registry/reference/section contradictions and alternate owner reuse.                                             |
| Real split compiler              | 3 tests passed, including deterministic compilation of the reviewed artifact package.                                                                                                                                                           |
| Runtime policy/dispatch/sections | 12 tests passed; direct and generic admission agree, tightened/disabled policies deny and restricted projection does not expose handlers.                                                                                                       |
| Studio authoring                 | 21 tests passed; compiler version assertion updated to 1.1.0.                                                                                                                                                                                   |
| Collaboration                    | 49 tests passed, including first-edit/stale/missing revision and canonical admission/default audience behavior.                                                                                                                                 |
| Attachment services              | 48 tests passed, including direct HTTP capability denial before finalize and existing quota/lifecycle coverage.                                                                                                                                 |
| Governance                       | 130 tests passed, including existing report/decision authorization behavior.                                                                                                                                                                    |
| Reviewed examples                | 93 artifact JSON schemas/content hashes and every enabled capability permission reference checked successfully.                                                                                                                                 |
| Typechecks                       | Platform host, Studio authoring, descriptor client and form-detail pass.                                                                                                                                                                        |
| Canonical DDL                    | `sync-document-foundation.mjs` passes across all planes.                                                                                                                                                                                        |
| Fresh installation               | Neon 229, Mesh 216, Studio 242 installation receipts; all completed successfully.                                                                                                                                                               |
| Application-role database checks | All three planes pass create/edit history, stale revision, rollback atomicity, immutable history/bytes/owner, cross-series pin rejection, folder-cycle rejection, private-history denial, canonical report/decision and cross-tenant isolation. |
| Real publication fixture         | Studio save/load under `athyperapp`, stale-save rejection and wrong-tenant invisibility → real split compiler → Ed25519 verification → stage/verify/activate → pinned reads of both capability sections. Passed.                                |

The full review-package `validate.py` remains blocked by a pre-existing localization inconsistency: `business_partner/presentation.section.contacts.json.emptyState.title` is a raw string where that script expects a translation object. Its rule was not weakened. The targeted 93-artifact schema/hash check and real compiler checks pass. Localization cleanup belongs to the separate ongoing localization work.

## Local reproduction and environment

The fixture container is `athyper-ca02-local-20260921`, labelled `athyper.environment=disposable_local`, using tmpfs database storage and no published host ports. All records/keys/signatures are synthetic. Existing local application databases and published Business Partner releases were not reset or republished.

```bash
# Run for neon, mesh and studio against an explicitly disposable empty database.
pnpm exec tsx server/db/scripts/provisioning/foundation-runner.ts \
  --plane=neon --container=athyper-ca02-local-20260921

docker exec -i athyper-ca02-local-20260921 psql -U postgres -d athyper_neon \
  < server/db/scripts/tests/integration/entity-collaboration-ca02.sql

# Refuses containers without the disposable name/label. Reruns publish a new fixture release.
pnpm exec tsx server/db/scripts/tests/integration/entity-capability-ca01.ts \
  athyper-ca02-local-20260921
```

Final accepted fixture: `metadata.compiled_entity.ca01_example`, release 1, hash `sha256:65dacb84b2888965cc31c58f7826f6c627efb443b5f963924783186ed99f4ad0`. It is a compilation/admission fixture, not a fabricated writable Currency or a claim of completed cross-entity user acceptance.

Before exercising these changes in an existing local application, provision the new source schema and republish definitions through the normal compiler. Old development definitions are intentionally not adapted. CA-03 continues parent/audience and association qualification; CA-04 implements lifecycle recovery/unlink/version operations; CA-05 finishes readers; CA-06–CA-10 deliver and accept the full experience.

# Entity authorization publication preparation

This tooling prepares a review packet for one explicit tenant/entity/plane. It
has no publish, apply, grant-write or enforcement option. The packet is not a
native signed publication artifact. Existing grants and DEV shadow configuration
remain unchanged.

## Current Business Partner result

The DEV CirrusAtlantic runtime selects tenant release **17**, publication key
`metadata.entity.business_partner.local-master-data.cirrusatlantic`, ahead of
global release **25**. Tenant precedence takes priority over the release number.
The active-row inventory previously listed both without resolving precedence.

The [publication report](../../governance/policy/reports/business-partner-authorization-publication.dev.json)
and its retained snapshot provide:

- 51 candidate operations, with permission, target/scope, source handler reference,
  invocation variant, and workflow/preflight requirements for each.
- 39 descriptor additions; 41 new authorization bindings and 9 replacements of
  existing binding scope or decision mode. The remaining binding retains its
  permission/scope shape; native publication must still bind it to the new release.
- Zero **unexplained** binding gaps. This means every operation has a mapping or
  explicit review disposition; it does not mean zero blockers or approved changes.
- 36 operations with one or more review gates: 29 scope compatibility differences,
  3 absent permission catalog entries, and 10 semantic review flags. Counts overlap.
- `publicationEligible: false`, `enforcementEligible: false`, and empty grant changes.

The missing catalog entries are `neon.relationship.business_partner.enter`,
`collaboration.comment.read`, and `document.attachment.read`. The planner leaves
permission IDs unresolved rather than creating catalog entries or aliases.
Tenant-owned BP reads conflict with currently organization-scoped catalog entries.
These differences require explicit scope/capability decisions, not automatic
organization-to-tenant widening.

Semantic flags cover application entry, direct create/update, five sensitive or
category capabilities, section amendment, and certification. Certification has no
dedicated request kind in the current request route contract. The proposal must
choose a supported amendment schema or explicitly author a new governed kind.
The section amendment permission is retained separately from case creation.

## Reproduce

From the repository root:

```sh
pnpm exec tsx tooling/scripts/verification/prepare-entity-authorization-publication.mts dev \
  44444444-4444-4444-8444-444444444444 \
  packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json \
  governance/config/governance/business-partner-authorization-bindings.v1.json \
  governance/policy/reports/business-partner-authorization-publication.dev.json

pnpm exec tsx --test tooling/scripts/verification/entity-authorization/publication-plan.test.mts
```

The command uses bounded, repeatable-read, read-only database transactions. It
captures activation heads, descriptors, permission catalog/scope compatibility and
operation bindings; it reads no business payloads or principal credentials.
It rereads heads and catalog/bindings after compilation and rejects concurrent
changes. No claim is made that this database-owner metadata inspection qualifies
an authenticated business journey.

## Contract and checks

The versioned [binding manifest](../../governance/config/governance/business-partner-authorization-bindings.v1.json)
is a **source-reference proposal**, not a runtime handler registry. Strict parsing
rejects unknown fields/versions, duplicate operations, absent handlers/workflows,
unsafe source paths, unresolved source anchors and preflight mismatches. The
existing authorization parser validates the profile and complete installed root
field coverage. Installed operation permissions and authorization mode cannot be
silently changed by the planner.

Selection follows `createRuntimeDescriptorRepository.findActive`: activation-head
membership, active applied release/descriptor, published contract, matching plane
and entity, then tenant override before global and descending release number.
The planner additionally rejects equal-precedence ambiguity and incompatible
head/release/tenant/hash coordinates. Published bindings whose effective dates do
not include capture time cannot satisfy installed binding coverage. Bindings from
another release are never reused to fill selected-release gaps.

The packet pins the winning head, all candidate head coordinates, profile,
manifest and source-file hashes. Its canonical candidate hash excludes capture
time. Old source release hashes and `operation_scope_bindings` IDs are removed
from the descriptor draft; native compilation must generate new compatible
coordinates. A draft must never be copied into a runtime descriptor table.

Source anchors prove only that the referenced implementation exists. They do not
prove registered runtime versions, endpoint integration, nested-field protection,
workflow routing configuration, or successful command execution.

## Completion and next engineering boundary

Completed here: effective-head resolution, a complete operation mapping review
packet, deterministic descriptor/binding preparation, explained gap dispositions,
and regression coverage. The original active-row migration report remains a
historical inventory/dry run; use this packet for the selected tenant release.

Remaining before a **compatible native publication** can be claimed:

1. Resolve each operation-specific catalog/scope/semantic flag. Record reviewed
   responsibility decisions separately; keep all effective grants unchanged.
2. Integrate handler and resolver references with the native registration/compiler
   contract. The existing global entity-operation projection compiler rejects
   tenant-owned releases and permission aliases across operation keys; do not
   bypass those checks to publish this tenant override. Extend and qualify the
   appropriate native path explicitly.
3. Compile the complete selected authoring release, preserving unrelated fields,
   presentation and operations, and emit compatible descriptor, binding, resolver,
   handler and workflow versions. Recheck the base-head pin before publication.
4. Complete endpoint/command qualification and separate governance approval before
   enforcement. Do not equate a source mapping with an executable handler.

Rollback selects compatible artifacts only after revalidating current revocations
and denials. No historical grant snapshot is restored. This work changes no
activation head and retires no compatibility path.

Native compiler implementation is now available through the publication worker;
see [native publication integration](entity-authorization-native-publication.md).
The packet remains a review artifact. It cannot substitute for a full authored
contract/runtime descriptor, exact catalog compatibility, callable registrations,
or authenticated runtime qualification.

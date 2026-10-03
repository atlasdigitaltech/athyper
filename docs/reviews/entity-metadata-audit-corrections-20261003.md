# Metadata folder audit corrections

Date: 3 October 2026. Scope: the supplied folder audit, all 49 entity source
descriptors, 15 native products, shared offline discovery and related verification.
These are authoring-source corrections; no publication, grants, SQL execution,
MFA changes or verified live user-flow changes occurred.

The [successor follow-up](entity-metadata-audit-followup-20261003.md) records the
later read-only local registry inventory, unsigned successor preparation, coverage
gate, enum tightening, test correction and historical-evidence workflow repair.
Use that report for current status; the observations below describe the first pass.

The existing [Country integration trace](entity-metadata-reconciliation-20261003.md#reference-integration-and-affected-shared-components)
identifies native compilation, capability/profile preparation, governed publication,
runtime metadata/provider resolution, authorization, routing and shared list/detail
rendering. Those runtime integration points remain unchanged by this correction.

| Audit finding | Disposition and correction |
| --- | --- |
| Nine references under common still compile for Neon only | All nine now explicitly require Studio/Neon/Mesh in descriptor `targets.required`. `targets.declared` truthfully remains Neon. Their split cores are per-plane compiled artifacts, not multi-plane products; changing `plane` to an array would violate the existing contract. Multi-plane authoring/provider/authorization reconciliation remains required. |
| Incorrect native `moduleCode: ent` | Corrected all 15 native products, beyond the ten cited: six references → `rel`; four IAM products → `iam`; Address and Person Address Use → `loc`; Employee and Person → `hr`; External Worker → `workforce`. `moduleCode` is required by native parsers and the system importer, so dropping it would break registration. It identifies the authoring module, not every target's menu module. Shared discovery checks agreement with the available source-plane placement. |
| Only 14 placements | Confirmed 14/49. The remaining 35 are not all approved standalone directories. IAM children have self/Principal-scoped surfaces; many BP children are parent-only proposals; exact reference directory placement/order remains unresolved. Do not generate routes or copy Principal's placement to its children. Pending exposure decisions remain visible in the existing surface proposal. |
| Seven split/native pairs | Confirmed, but they are complementary contracts, not interchangeable duplicate products. Country has 22 native versus two split fields; Locale/State Region also use different field identities. BP candidate membership explicitly depends on Country, State Region, Timezone and Address split cores; Address's split operations include governed behavior absent from its native product. Retained all inputs and documented canonical native selection versus split dependency inputs. Lossless compiler consolidation remains pending. |
| Classification exists only in folders/review docs | All 49 descriptors now use `athyper.entity-source/2`, with explicit platform authoring ownership, graph class/ownership evidence and declared/required/recommended targets. Shared resolver, TypeScript declarations, schema and contract updated together; `/1` compatibility retained. Fifteen native classifications are resolved; 34 split graph classifications remain explicitly null instead of fabricated values. |
| Mixed directory axes | Source homes remain organizational. Resolver validation uses descriptor/product/placement properties, never directory names. No second relocation is necessary to correct behavior. |
| Workforce/HR naming | Employee and Person retain Neon `ppl/hr` placement and now native `hr` module identity; External Worker retains `ppl/workforce`. The folder label assigns no module identity. |
| Certification plane ambiguity | Explicitly recorded current declared Neon coverage, with no required/recommended expansion. Mesh DDL proves storage evidence only. Definition-versus-assignment scope and final target decision remain unresolved in the existing surface proposal. |
| Studio 32-versus-33 catalog | Located the 32-module source: `governance/catalog/platform-catalog.v1.json` and `tooling/scripts/catalog/generate-platform-catalog.mjs` (`expectedCounts.studio`). SQL master/control seeds use 33. The sole extra SQL module is `exp`, Experience & Navigation Design, under Entity Studio. No new module navigation or historical migration edits were invented; governed catalog reconciliation remains pending. |

Required coverage is now machine-readable for 19 entities (57 entity/plane
combinations); seven recommended business entities record 21 proposed combinations.
This records coverage intent, not successful multi-plane compilation or activation.
The existing proposal and frozen inventories remain historical evidence; their
byte hashes were not rewritten to match successor source edits.

Changing native module identity changes product hashes. Existing registrations
under `ent` may fail the importer's identity-conflict check until independently
reviewed registry corrections and successor releases are prepared. That failure
must not be bypassed, and source edits do not silently update active registrations.

Validation:

- Shared metadata layout check passed: 175 preserved relocated files, 202 entity
  JSON files and 13 profile files, with logical references resolved.
- Metadata resolver/layout and catalog placement tests: 11 passed. Negative
  fixtures cover malformed classification, target mismatches, incompatible
  modules, missing files, unresolved refs and v1 compatibility. Two old layout
  assertions were corrected to match the shared resolver's actual diagnostics.
- Native product, table product, system import and successor capability tests:
  30 passed. The capability fixture now resolves Country through the shared
  resolver and uses its product's module identity instead of literal `ent`.
- All 49 descriptors passed the v2 JSON schema; schema self-validation passed.
- Generated platform catalog `--check` and `git diff --check` passed.
- The initial package-wide run had 366 passing tests, one skipped and four
  failures. Three stale Country-path failures were fixed and their tests passed
  above. The remaining unrelated `list-experience.test.ts` assertion expects an
  absent operation permission to throw, contrary to the standing undefined
  permission rule. Production authorization was not changed for this audit.
- The broader Python metadata validator failed **before source corrections** on
  the registry's missing historical path
  `server/db/ddl/planes/neon/master/18_business_partner_business_profile.sql`.
  Historical registry evidence/hashes were preserved; no replacement SQL was
  fabricated to satisfy the gate.

The frozen relocation `--baseline` compares pre-correction bytes and is no longer
an acceptance gate for the changed descriptors/products. Its historical hashes
remain unchanged. Source correction checks do not satisfy governed independent
review, signing, per-target activation or live list/detail/embedded-flow testing.

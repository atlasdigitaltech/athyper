# Verification — "Shared related-record contract hard-codes the owner entity business_partner"

Area: Entity-runtime contracts, descriptor client and shared foundation UI
Cited finding: `packages/contracts/platform/entity-runtime/src/related-presentation.ts:543`
Verdict: **partial** — the hard-coding is real and reproduced; the claimed trigger and impact are not reproducible as written.
Severity after verification: **medium** (was `high`).

## What is confirmed

The exact quote and line are correct:

- `packages/contracts/platform/entity-runtime/src/related-presentation.ts:543` — `if (profiles.length && entityCode !== "business_partner")`
- `:544-546` — `` throw new TypeError(`No related record providers registered for ${entityCode}`) ``
- `RELATED_RECORD_MODELS` at `:73` is business_partner-only: `:77` `"business_partner.external_reference"`, `:88` `"business_partner.contact_person"`, `:109` `"business_partner.address_link"`.
- The source set is additionally closed at `:210-214` (`contact-person.v1 | address-link.v1 | external-reference.v1`) and each source's `sectionKey` is forced to the model's section key at `:217-218`, so a non-`business_partner` owner has no other route through this contract.

Reproduced directly (read-only, tsx against current source):

```
country        => THROW: No related record providers registered for country
principal      => THROW: No related record providers registered for principal
business_partner => OK
[] (empty) + country => OK        # guard is length-gated
```

Callers confirmed:

- `server/packages/platform/metadata/src/descriptor-parser.ts:67` — `if (recordPresentation?.related) validateRelatedPresentationOwner(recordPresentation.related, row.entity_code)`; `parseEntityRuntimeDescriptor` is used by read and publication paths (`metadata-service.ts:43`, `runtime-descriptor-repository.ts:52`, `distributed-descriptor-cache.ts:163`, `publication-artifact-loader.ts:260/281/320`, `entity-authorization-compiler.ts:264`).
- `server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts:543` — `compileGraph` enforces the same guard for graph-authored entities.

So "shared related-record contract is permanently single-entity" is a true statement about this contract.

## What is refuted / corrected

1. **The stated trigger for Country is not reachable.** Country is a `athyper.shared-reference-product/1` product (`metadata/products/shared/entities/country/definition.json`) parsed by `parseSharedReferenceProduct` (`server/packages/planes/studio/meta-entity-authoring/src/authoring/product.ts:42`). That parser rejects unknown definition keys at `product.ts:15` (`REFERENCE_PRODUCT_KEYS_INVALID`); the allowed/optional key lists (`product.ts:45-46`) contain no `related`. `buildSharedReferenceGraph` (`authoring/graph-builder.ts:80`) also emits `recordPresentation` without `related`. Reproduced:

   ```
   country plain          => OK
   country + related key  => THROW: REFERENCE_PRODUCT_KEYS_INVALID
   ```

   So "the moment Country declares a related projection, publication fails with *No related record providers registered for country*" is false: it fails earlier, with a different error, and never reaches `related-presentation.ts:543`. No key in `metadata/schemas/entity-artifacts-v2/` (`presentation_surface.schema.json`) or the reference-product schema can express `related` either. The guard is only reachable for descriptors authored out-of-band (direct descriptor write, e.g. the `publish-development-record-presentation.ts` script) or via an open `layoutConfig` on a full `MetaEntityGraph`.

2. **The shared related-record UI is unreachable for every entity, including business_partner.** The browser-safe detail descriptor is produced through `readableRecordPresentation`, which explicitly nulls the projections: `packages/contracts/platform/entity-runtime/src/record-presentation.ts:290-291` — `// Related projections have their own authorization boundary; flat entity fields cannot authorize them.` / `related: undefined`. That projection is what `server/packages/services/records/src/entity-list-service.ts:502` passes into `parseEntityDetailDescriptor` (`:540`) for the `/api/entity-runtime/:entityCode/detail-descriptor` route (`entity-list-routes.ts:336`). The consuming component `RelatedRecord` (`packages/platform/entity/runtime/form-detail/src/related-record.tsx:372`) has no runtime caller — only `tests/foundation/entity-related-presentation.test.tsx`. The guard is therefore not what makes the related UI unreachable; the descriptor projection does, for all owners.

3. **The only concrete business_partner related projection has no live source in the repo.** `tests/foundation/entity-related-presentation.test.tsx:21` reads `server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json`, which was deleted in `870f08f52` ("cleanup: remove bespoke business partner and workforce"); the remaining `publish-development-record-presentation.ts` requires a caller-supplied config path. No file under `metadata/` declares a `related` projection (only `metadata/schemas/entity-artifacts-v2/operation.schema.json:160` mentions the token, unrelated).

## Net assessment

Real shared-framework defect (hard-coded single owner in a shared contract, closed source enum, business_partner-named relationship catalogue), but latent: no metadata path can currently express the input, no second entity declares it, and the related UI/route is not wired for any owner. The claim's "publication fails for country" mechanism and its "UI unreachable by that entity" causality are incorrect. Severity `high` overstates present impact; `medium` matches a latent, non-user-visible blocker that must be fixed before any second entity can onboard related projections — and the fix also requires opening the metadata schema/graph-builder path and re-wiring the descriptor projection, not just this guard.

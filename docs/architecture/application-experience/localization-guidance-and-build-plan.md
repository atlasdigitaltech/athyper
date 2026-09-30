# Three-plane localization — guidance and deferred build plan

Created: 2026-09-21. Status: **proposed; implementation deferred**.

This is a separate follow-on workstream for Neon, Mesh and Studio. It does not amend or supersede the [Shared Application Experience build plan](build-work-plan.md) or the [Comments and Attachments build plan](entity-comments-and-attachments-build-plan.md). Creating this document does not start localization implementation or establish completion of either prerequisite.

## 1. Start condition and working scope

**Begin implementation only after Business Partner, including the accepted Comments and Attachments scope, is fully complete.** Use the existing workstream's final local acceptance and completion record, including CA-10, as the prerequisite evidence. Basic comment/upload rendering is not sufficient. Resolve outstanding required functionality and regressions before starting this plan.

At the start, re-read the completed implementation: comments, attachments, metadata contracts and renderers can change before localization begins. Treat the paths and findings below as a dated baseline, not a reason to undo subsequent work.

The first implementation target is a complete Business Partner experience with Comments and Attachments, supported by one shared localization mechanism across all three planes. Then migrate the remaining in-scope plane features using a measured catalog inventory. Do not claim every plane is fully translated from a Business Partner pilot alone.

Follow the existing local development model: comprehensive changes within each work package, focused regressions and one integrated local acceptance pass. No production rollout program, migration framework, repeated approval gates or separate evidence dossier is required. Do not reset an existing database or rewrite published immutable releases as a shortcut.

This document authorizes no application, database, translation or deployment changes. Those belong to the deferred implementation workstream.

## 2. Current baseline and gaps

| Existing capability | Location / observation | Direction |
|---|---|---|
| Shared localization engine | `packages/platform/foundation/i18n/src/` | Retain formatting, ICU support, React/server APIs and locale registry |
| Shared shell provider | `packages/platform/shell/shell/src/index.tsx`; consumed by the three plane shells | Compose catalogs consistently through the existing provider |
| Shell resources | `packages/platform/shell/shell/src/messages.ts` | Currently chooses Arabic or English; move resources without changing existing key identities |
| Entity resources | `packages/platform/foundation/i18n/src/entity-messages.ts` | Separate resource ownership from engine implementation |
| Local fallback wrapper | `packages/platform/entity/runtime/list-view/src/overview-messages.ts` | Consolidate fallback behavior in the shared resolver |
| Business Partner validation copy | `packages/planes/neon/business-partner/src/validation-messages.ts` | Preserve rule/outcome semantics while replacing English strings with message references |
| Localized metadata contract | `packages/contracts/platform/entity-runtime/src/runtime-resource.ts` | Reuse `labelKey` and `defaultText` rather than inventing another label contract |
| Record renderer | `packages/platform/entity/runtime/form-detail/src/compiled-section-content.tsx` | Some paths display `defaultText` directly; make all migrated paths resolve keys |
| Empty-state projection | `server/packages/platform/experience/src/entity-section-service.ts` | Current title/detail strings need localized references in source, compiler, projection, parser and renderer |
| Locale governance | `shared.locale`, `control.ui_locale_catalog`, tenant activation/profile and principal UI profile | Retain plane/tenant enablement and preference authority |
| Existing verification | `tooling/scripts/policy/verify-i18n-foundation.mjs`, foundation and experience localization tests | Extend these checks; remove assumptions tied to old file locations |

Eight registered locales do not establish eight complete translations. Existing foundation/demo qualification must not be treated as proof of coverage for every entity and module. Review actual catalogs and governance evidence before changing enablement.

Prior localization fixes and validation are recorded in [the localization API review](../../runbooks/platform-localization-api-review-2026-09-06.md). Preserve its preference, tenant isolation and cache-race protections; verify their current implementations during the inventory phase.

## 3. Ownership model

Use **platform + canonical entity + plane/workspace/module** ownership. Database schema names describe storage and must not define translation identity. Workspace placement describes navigation and must not duplicate entity dictionaries.

| Scope | Owns | Examples |
|---|---|---|
| Platform | Shared independent actions, shell, generic runtime states and capability UI | Save, Cancel, Context required, Comments, Attachments |
| Canonical entity | Entity names, field labels, section names, status meanings and entity-specific messages | Business Partner, registration country, tax-identifier empty state |
| Plane | Plane-specific product language | Neon operational instructions, Mesh collaboration instructions, Studio authoring instructions |
| Workspace/module | Navigation labels and contextual journeys | MDG workspace label, supplier onboarding guidance |
| Record data | Business values entered or supplied by users | Partner name, comment body, filename; not UI translation keys |

Reuse a canonical entity catalog across planes only where the entity identity and business meaning are shared. Same-named but semantically different entities require distinct catalog identities. Studio authoring help about an entity belongs to Studio; the entity's field label remains canonical.

Comments and Attachments resources belong to the shared capability catalog. Entity-specific instructions can reference additional entity keys without copying the capability's actions, errors or accessibility labels.

## 4. Proposed folders and package boundaries

Paths are relative to the repository root. This structure is proposed, not yet created.

```text
packages/platform/foundation/
  i18n/                              # Existing engine; no domain message imports
    src/
  i18n-catalogs/                      # New data-only resource package
    src/
      manifest.ts                    # Owners, namespaces, locales, explicit loaders
      generated/                     # Generated key/argument types and indexes
    resources/
      platform/
        en/
          actions.json
          shell.json
          entity-runtime.json
          validation.json
          access-states.json
          comments.json
          attachments.json
        ar/...
      entities/
        business_partner/
          en/
            labels.json
            sections.json
            empty-states.json
            validation.json
          ar/...
        business_partner_request/...
      planes/
        neon/
          en/
            application.json
            workspaces/mdg.json
            modules/bp.json
          ar/...
        mesh/...
        studio/...
```

Use the same structure for `ms`, `zh-Hans`, `hi`, `ta`, `fr` and `de` when their resources are supplied. Do not create English copies and count them as translations.

The resource package has no imports from plane application code. Its plane resources have explicit ownership and separately addressable exports/loaders. A single package must not imply one browser bundle containing all planes and languages. Application composition loads the required namespaces; the generic engine receives catalogs and knows nothing about Business Partner.

Keep workspace and module resources independent: moving a module between workspaces must not rename entity or module message keys. Keep translator descriptions, ownership and usage context in sidecar metadata or generated extraction records; JSON catalog values remain ICU message strings.

## 5. Message and reuse rules

1. Preserve existing stable keys, including `shell.*` and `entity.overview.*`. Introduce new keys for new meanings, not merely to standardize spelling. Check proposed new key formats against the existing metadata key validators.
2. Use explicit references to shared keys. Do not search other entities or planes for a matching English string at runtime.
3. Reuse only when meaning and grammatical context match. An Open action and an Open status need separate keys, even if their English text matches.
4. Translate whole sentences. Do not construct empty states or validation messages by concatenating translated nouns with English sentence fragments.
5. Use ICU named arguments and plural/select constructs for counts and variations. Validate syntax and argument names/types. Each locale may need different plural categories.
6. Canonical English is the source catalog. Metadata `defaultText` is an emergency readable fallback, generated or checked against that source where applicable; it is not a second independently edited dictionary.
7. Keep icons, layout, field identities, enum codes, API error codes and authorization decisions outside translation resources. Translate an enum's displayed meaning, not its stored value.
8. Keep record data intact. Render comments, filenames and identifiers with appropriate bidirectional isolation; do not translate user content through UI catalogs.

Illustrative new keys (validate naming during L10N-01):

```json
{
  "entity.business_partner.sections.identifiers_tax.empty.title": "No tax identifiers yet",
  "entity.business_partner.sections.identifiers_tax.empty.description": "When tax identifiers are added, they’ll appear here."
}
```

Use translation-memory suggestions to find reuse candidates, followed by semantic review. Do not automatically collapse messages because their English values match. See [W3C string reuse guidance](https://www.w3.org/International/articles/text-reuse/) and [ICU message formatting guidance](https://unicode-org.github.io/icu/userguide/format_parse/messages/).

## 6. Resolution, metadata and runtime behavior

### Catalog composition and fallback

Compose only the required platform, entity and current-plane namespaces. Preserve duplicate-key rejection; do not turn merge order into an implicit override mechanism. Intentional contextual wording gets a distinct key, explicitly referenced by metadata or the caller.

For the same key, use the effective policy's deterministic locale fallback chain, then canonical English, then the supplied metadata default. An English request must not fall through to an unrelated regional language. Honor the existing distinction between UI locale, catalog locale and formatting locale.

Format a fallback message using the language of the selected message, so ICU plural rules remain correct. Continue using the configured formatting locale/time zone for business dates and numbers. Keep SSR and client catalog selection consistent to prevent hydration differences.

Development diagnostics identify missing/invalid keys and namespaces. Known UI messages must fail publication/build validation when required resources are absent. Unexpected runtime gaps should produce readable fallback text and bounded diagnostics without exposing technical keys to ordinary users.

Distinguish a catalog that is still loading or failed to load from a genuinely missing translation. Do not cache a transient loading fallback as the final translated value.

### Metadata wiring

Reuse the existing localized-text contract throughout field labels, tab/section headings, empty-state title/detail, help, validation and capability messages. Trace each change end to end:

```text
authoring definition → contract validation → compiler/publisher
  → activated immutable artifact → authorized browser projection
  → client parser → shared text resolver → rendered UI
```

A documentation example or draft JSON change is not a published runtime change. Validate referenced keys and required namespace declarations at publication, pin catalog compatibility/revision with the compiled artifact, and verify the actual activated payload in the local acceptance pass.

Determine the final contract changes after Comments and Attachments completion. In the local build, update source contracts and callers together and republish affected definitions. Do not add a legacy compatibility framework by default or mutate old immutable releases in place.

Keep server error codes stable. Clients resolve known safe error messages and parameters; untranslated unknown failures use a generic localized message with an existing support/request identifier. Never interpret arbitrary server details or user content as ICU templates.

### Isolation, caching and loading

Static shipped catalogs may be cached by namespace, locale and catalog revision. Authorized metadata/record resources retain their existing tenant, plane, principal, scope and release boundaries. Do not introduce tenant-specific wording into globally shared cache entries.

Include locale/catalog revision in caches whose contents are localized. Locale changes must refresh text without resetting the selected record tab, section, scroll destination, comment draft or attachment workflow. Guard against stale in-flight responses and preserve existing authorization/cache invalidation behavior.

Keep locale enablement controlled by existing plane and tenant governance. No new tenant translation editor, translation database or arbitrary override layer is included in this plan; those would be separately scoped product features.

## 7. Deferred implementation sequence

All work packages below are **not started**. L10N-00 is also deferred until the prerequisite in section 1 is met.

| ID | Work package | Depends on | Deliverable / exit check |
|---|---|---|---|
| L10N-00 | Rebaseline and inventory | Completed BP + Comments/Attachments acceptance | Inventory visible strings and metadata paths across all three planes; owners, existing keys, duplicates, hardcoded copy, locales and actual coverage recorded |
| L10N-01 | Catalog structure and key contracts | L10N-00 | Data-only catalog package, manifest, ownership rules, generated key/argument types and explicit namespace exports; existing keys preserved; duplicate and ICU validation pass |
| L10N-02 | Shared loading and resolution | L10N-01 | One consistent resolver/provider path for SSR and client, deterministic fallback, diagnostics, revision-aware loading and stale-response protection; focused resolver tests pass |
| L10N-03 | Metadata and publication integration | L10N-02 | Localized references survive authoring through active browser payloads; missing required keys rejected; field/section/empty-state rendering no longer bypasses resolution |
| L10N-04 | Platform and capability resources | L10N-02, L10N-03 | Shared shell, runtime states, Comments and Attachments use common catalogs; existing behavior and accessibility retained |
| L10N-05 | Complete Business Partner pilot | L10N-03, L10N-04 | Record/360, intake and required workflows, validation, Comments and Attachments localized; no tax-only special cases or display-label sentence construction |
| L10N-06 | Plane catalog segregation and remaining feature migration | L10N-05 | Neon, Mesh and Studio compose only required resources; remaining in-scope features from L10N-00 migrated; shared entity keys reused and distinct contexts preserved |
| L10N-07 | Locale coverage and governance | L10N-06 | Real translated resources, linguistic/layout checks and feature coverage reconciled with locale qualification; incomplete locales explicitly reported, not counted complete through English fallback |
| L10N-08 | Integrated local acceptance and cleanup | L10N-07 | Required journeys pass; obsolete dictionaries/fallback wrappers removed after consumer checks; actual results and remaining locale limitations recorded |

Resource files created in L10N-01 do not establish completion of their consumer migrations. Native-language review can proceed alongside implementation once catalogs stabilize, but qualification remains dependent on verified coverage and behavior.

For each package record only: what changed, what was checked, what remains. Run affected typechecks and meaningful focused regressions, then one integrated final pass. Repeat broader tests only when subsequent changes or failures justify it.

## 8. Validation and acceptance

### Automated checks

- Unique ownership of keys; conflicting definitions rejected; all required metadata references resolve.
- ICU parse validity and argument compatibility; translated messages retain required parameters without forcing English plural categories.
- Exact/base/policy/English/default fallback behavior and correct message-language formatting.
- Catalog fetch failure, locale switching and stale responses; no tenant or plane-specific catalog leakage.
- Server/client initial locale agreement and layout direction; logical CSS spacing and isolated identifiers.
- Known authorization/context-required/API errors remain distinct from empty-data states.
- Publication round trip proves the activated artifact's localized references and catalog revision reach the browser.
- Scoped extraction/linting detects untranslated user-facing strings in migrated areas, with explicit exceptions for record data and technical identifiers. Avoid a noisy repository-wide prohibition before inventory.

### One final local acceptance pass

- Business Partner overview and all required tabs/sections show correct labels, selected state and existing scroll behavior after locale changes.
- Empty tax, banking, qualifications, roles, comments and attachments states use the intended semantic messages, icons and alignment.
- Comments/Attachments drawer and expanded view retain the completed capability behavior, drafts, upload progress and permission boundaries.
- Intake validation and required actions display localized copy without altering rule outcomes or request payloads.
- Exercise Neon, Mesh and Studio shell/navigation/context selection in English and Arabic, including RTL, keyboard focus, accessible names and long labels.
- For each additionally qualified locale, verify its real resource coverage and representative affected layouts; English fallback alone is not a passing translation result.
- Demonstrate canonical label reuse in at least two real consumers and isolation of an intentionally plane-specific message.
- Confirm payloads load the needed namespaces rather than every plane/language catalog.

## 9. Completion record

| Item | Current status |
|---|---|
| Localization guidance and follow-on plan | Documented; proposed |
| Prerequisite BP + Comments/Attachments completion | Must be checked against the existing workstream at execution time |
| L10N-00–L10N-08 | Deferred / not started |
| Application, schema, catalog and deployment changes from this document | None |

At final acceptance, replace these statuses with actual results in this document. Record per-plane/feature/locale coverage explicitly so a completed platform engine is not mistaken for complete product translation.

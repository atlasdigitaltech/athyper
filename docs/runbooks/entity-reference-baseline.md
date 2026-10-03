# Reference baseline and shared choice fields

## Stage acceptance — 2026-10-01

**Stage 1 — Reference baseline: functionally complete.** The project owner reports successful manual testing of Country, State/Region, Currency, Language, Locale and Timezone across **Neon, Studio and Mesh**, including the AI agent. This is user-reported acceptance of published metadata, standard list/detail, search/filter/sort, declared relationships, authorization and Atlas lookup with citations; it is not a claim that this turn reran those tests automatically.

The dated checkpoints below retain the implementation and automated DEV evidence available at each point. Their earlier Stage 1 pending statements are superseded by this acceptance. The lack of a positive populated composite-parent fixture and the separate reviewed-commit/remote-CI release evidence remain recorded limitations, not fabricated passes. Broader release and unrelated AI regression gates are tracked separately from functional Stage 1 acceptance.

**Stage 2 — Principal family: analysis started; qualification remains open.** See [Principal family analysis and execution plan](entity-principal-family-stage2.md). Existing Principal/Profile/Notification Preference publication and pilot evidence are reused; the family is not treated as a greenfield onboarding.

## Scope and sequence

1. **Reference baseline:** Country, State/Region (`state_region`), Currency, Language, Locale, Timezone.
2. **Principal family:** Principal, Principal Profile, Notification Preference, then eligible user-related Entity definitions.
3. **Employee family:** Employee and eligible related Entity definitions.
4. **Business Partner family:** Business Partner, addresses, contacts, roles and eligible related Entity definitions.

Each stage uses the existing Entity authoring, independent publication, authorization, Records service, list/detail routes and Atlas tools. No new custom page or provider stack is introduced. Reference source metadata does not grant a user permission or activate a release.

## Choice metadata

The shared reference product accepts `type: "enum"`, a `domainCode`, and a nonempty, unique `choices` array. Each choice has a stored `value`, display `label` (including the standard localized-text contract), and optional semantic `tone`. A status field also declares `semanticRole: "status"`.

Country's PostgreSQL `shared.ref_status_d` permits exactly `active` and `deprecated`. All six reference definitions publish those values as **Active** and **Deprecated**, with success and warning tones respectively. Language and Locale also publish the `ltr`/`rtl` values permitted by their database CHECK constraints. Raw codes remain the filter values and stored data.

The graph builder puts choices on both list and detail bindings, copies localized choice labels into published presentation metadata, and declares the record-header badge. Native lowering retains the enum options and status tones. The existing Records descriptor, standard formatter, enum dropdown and record header consume these declarations. The collection header remains a record count, not a synthetic aggregate status.

Enum filters use the runtime-supported equality, inequality and membership operators. They no longer fall back to a text input or text `contains` operator. Boolean chip controls remain unchanged. Domain labels are available for display even when an otherwise readable enum is not filterable.

Authorization is enforced before field projection and choice loading. Masked fields receive no option labels, localized option dictionaries, status-tone dictionaries or header badges. Denied fields are excluded. The nested record-presentation localization is filtered as well as the top-level descriptor.

## Six-entity source baseline

| Entity       | Source                                           | Publication in this change | Natural key / notes                                                                                           |
| ------------ | ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Country      | `metadata/entities/country`      | Pinned successor           | `code`; existing capabilities and permissions preserved                                                       |
| State/Region | `metadata/entities/state_region` | Initial draft              | Composite `(country_code, code)`; not falsely declared globally unique on code alone                          |
| Currency     | `metadata/entities/currency`     | Pinned successor           | `code`                                                                                                        |
| Language     | `metadata/entities/language`     | Pinned successor           | `code`; text direction choices                                                                                |
| Locale       | `metadata/entities/locale`       | Initial draft              | `code`; text direction choices                                                                                |
| Timezone     | `metadata/entities/timezone`     | Initial draft              | `code` is the title because name is nullable; standard UTC offset is a display hint, not DST conversion logic |

All six sources declare read-only Atlas discovery/named lookup, record read and field explanation through published metadata. They declare no AI write actions. Country retains its existing collaboration and snapshot declarations. Source compilation is not proof of live inference or access.

## Published key references and dynamic lookups

The database relationships are:

- State/Region `country_code` → Country `code`.
- State/Region `(country_code, parent_code)` → State/Region `(country_code, code)`.
- Locale `language_code` → Language `code`; Locale `country_code` → Country `code`.
- Timezone `canonical_code` → Timezone `code`.

Reference fields now declare `keyReference: { targetEntity, labelField, fields: [{ source, target }] }` in source metadata. The authoring graph retains this on `typeConfig` with the existing Entity reference binding. Publication checks the declared mapping against actual target unique keys and source foreign keys, including self references and reverse dependencies. Target key fields must be immutable. Reference baseline source fields are read-only; the Stage 2 shared editing extension permits mutable foreign-key fields only with authorized target validation on writes. Tenant-scoped targets require an explicit tenant-key mapping. No storage paths or executable query fragments are accepted in this contract.

The shared Records reference reader resolves codes to display labels through the existing authorized list and record owners. Both sides must admit every mapped field and the target label; hidden or masked values cannot supply choices or labels. Raw `values` retain codes, while `displayValues` carry authorized labels. List hydration uses bounded concurrency and a request-local cache; authorization results are never shared across requests.

The existing Entity runtime exposes paginated/searchable reference choices at `GET /api/entity-runtime/:entityCode/references/:fieldKey`. Composite lookups require the other mapped fields as dependencies; the current list filter supplies these from applied equality filters. For a parent-region filter, apply the country equality filter first. Record-anchored lookup reads dependencies from the authorized source record and rejects caller overrides. Browser lookup requests are cancelled on context changes. Atlas follows these same published mappings through authorized Entity queries and cites the source and target record UUIDs.

Finite enum choices remain distinct from dynamic Entity lookups. Existing approved lookup resolvers remain supported. This implementation covers declared code/composite-key references; it does not infer relationships from field names. Deployed browser and Atlas traversal qualification is still required before closing Stage 1.

## Reproducible DEV preparation

Apply `server/db/migrations/20261001_entity_key_reference_contract.sql` to the Studio metadata database before saving key-reference drafts. It extends only the strict field-contract validator and rejects an unexpected existing validator body. It is idempotent and changes no records, grants or activation heads. The canonical Studio DDL contains the same validator.

Run from the repository root:

```sh
node tooling/scripts/verification/prepare-reference-baseline-dev.mjs --output=<private-evidence-directory>
```

This performs checks in rolled-back transactions. To save the six drafts and reviewable policy candidates:

```sh
node tooling/scripts/verification/prepare-reference-baseline-dev.mjs --output=<private-evidence-directory> --confirm=DEV-PREPARE-REFERENCE-BASELINE
```

The helper reads the active DEV heads, uses the existing importer for new entities, and creates pinned successors for existing entities. Successor amendments preserve storage, permissions, capabilities, unrelated presentation and predecessor coordinates. Evidence includes baseline, request, draft and policy-candidate JSON per entity. No approval, signature or runtime activation is fabricated. Review and publish each policy through the existing independent maker/checker workflow. Restart source services only when the shared inference lease is quiescent.

## Qualification evidence (2026-10-01)

Private DEV receipts: `~/.athyper/instances/dev/evidence/reference-baseline-20261001/batch/`.

- Six drafts persisted and policy candidates prepared; none published by this task at this checkpoint.
- All 18 entity/plane candidates lower to read-only runtime descriptors with enum labels, status tones and AI declarations.
- Authoring suite: 250 tests passed, including preservation of historical publication hashes and successor boundaries.
- Records targeted suite: 33 tests passed, including plain/masked/denied choice disclosure.
- Metadata projection checks: 6 tests passed.
- Host reference-baseline checks: 6 tests passed, each covering all three planes.
- Authoring, metadata, Records, form-detail and DB package typechecks passed.
- Nine browser regressions passed: shared enum selection, raw submitted code, restored selection, record-header display, nested column-filter dropdowns and existing reference controls. This is component evidence, not deployed DEV qualification.
- Foundation list/header tests: 27 passed.
- Saved Neon test session returned authenticated; no Atlas MFA refresh is needed.

Stage 1 remains open until independent publication, target activation and real browser list/detail/search/filter/sort flows pass for the batch, followed by Atlas lookup/citation checks and the relationship/dynamic-lookup gates above. Full release CI and reviewed-commit evidence remain separate release gates.

## Key-reference implementation checkpoint (2026-10-01)

Updated private candidates: `~/.athyper/instances/dev/evidence/reference-baseline-20261001/key-references/`. Country, Currency and Language reuse their prepared successor requests; State/Region, Locale and Timezone have new product-hash drafts containing the relationships. Previous unapproved drafts are not publication targets for this batch.

- All six updated drafts persisted and passed stored-graph validation; independent publication remains pending.
- Read-only DEV FK and unique-key qualification passed for all 18 entity/plane combinations. Negative target/label/non-unique-key checks passed on each plane.
- Authoring: 250 tests passed. Metadata: 94 passed, 2 skipped.
- New key-reference contract checks: 7 passed; Records reference checks: 12 passed, including source/target denial, masked labels, composite scoping, ambiguity and revocation.
- Atlas lookup tests include code and composite-key traversal with both citations.
- Seven focused browser tests passed, including delayed lookup responses after context changes. These are component tests, not deployed qualification.
- Studio validator migration applied; read-only SQL contract checks passed. DB package typechecking passed.
- Saved Neon browser session remains authenticated. No additional Atlas MFA is requested.

Publish in dependency order: Country, Currency, Language, State/Region, Locale, Timezone. The DEV source runtime must include this implementation before release execution and live qualification. Do not restart the API while its shared inference lease is active. Required final evidence remains exact release activation, six-entity browser list/detail/filter/search/sort behavior, and Atlas lookup and traversal with citations under the saved ordinary session.

Operational checkpoint: the DEV inference owner heartbeat is `2026-10-01T04:39:40.481Z` and was stale at inspection. Treat this as abandoned admission requiring controlled quiescent recovery, not evidence of a live request. This task has not cleared the lease or restarted the API.

## Publication checkpoint (2026-10-01, after independent maker/checker)

All six exact releases are verified active on Neon, Studio and Mesh (18 activation-head checks): Country 13, Currency 2, Language 2, State/Region 1, Locale 1, Timezone 1. Private receipts are in `key-references/{entity}/policy-proposed.json`, `policy-active.json`, and `execution.json`; `activation-verified.json` records the exact deployed release IDs.

The abandoned DEV inference admission was recovered only after API, worker, scheduler and inference engine quiescence. An atomic comparison protected the unchanged stale owner/heartbeat before reinitializing the admission epoch. Services were restarted on the existing source deployment; recovery evidence is `key-references/deployment/recovery.json`. The six releases were then executed in dependency order.

The saved Neon test session was refreshed through normal sign-in. The qualification below supersedes the earlier pending-session checkpoint; no Atlas-specific MFA elevation was requested.


## Deployed qualification checkpoint (2026-10-01)

Publication is complete on all three planes. Browser and Atlas checks below ran on **Neon**, using the saved ordinary `catl.admin` session. They are not a claim of browser qualification on Studio or Mesh.

- All six standard list/detail journeys passed with published Active/Deprecated labels, status badges and supported status filters. API checks covered sorting and lookup search.
- The actual State/Region Country filter searched Malaysia, selected the authorized option and returned 16 rows, all scoped to `MY`.
- Composite parent-region choices were scoped to the selected country; omitted dependencies returned 409. Canonical-timezone lookup also passed.
- From Country, Atlas returned cited summaries for Currency `MYR`, Language `en`, State/Region `MY-01`, Locale `en-MY` and Timezone `UTC`.
- From Johor, both “What is Malaysia country calling code?” and “What is this state country calling code?” returned Malaysia / 60. The relative journey cited both the source State/Region record and the target Country record.
- None of these Atlas journeys requested MFA elevation.

The shared Atlas discovery now treats navigation context as a fallback hint and ranks explicitly requested entities first. Narrow explicit code-summary requests and unambiguous relative relationship/field requests can be resolved from current-turn authorized metadata. The existing tool coordinator still binds the discovered publication and rechecks source/target authorization. No entity names, record IDs or answers are hardcoded. Unrecognized names, extra clauses and ambiguous relationships remain with normal planning; these checks do not prove unrestricted natural-language coverage.

Direct answers that use discovery followed by an Entity read require matching durable, completed read invocations for every step, scoped to tenant, principal, plane and run. Missing receipts fail completion; discovery alone cannot count as record evidence. Forty-seven focused AI tests and AI production/test typechecks passed.

Private evidence under `key-references/`: `browser/report.json`, `filter-browser/report.json`, `atlas-reference-batch/report.json`, and `atlas-country-final/report.json`, with browser screenshots and SSE receipts. Reproduce using the corresponding `qualify-reference-*-dev.mjs` and `qualify-atlas-entity-lookup-dev.mjs` scripts with the trusted DEV CA and ordinary saved browser state. Keep source files stable during live inference: the DEV API watches source changes and restarts automatically.

Remaining gates:

- A positive existing-record composite parent traversal still needs an authoritative populated parent fixture. DEV State/Region currently has no non-null `parent_code`; FK/unique-key checks, scoped lookup checks and unit traversal checks passed, but do not replace that live journey.
- A reviewed commit and remote required CI checks remain release gates. This checkpoint is source-mounted DEV evidence, not an immutable release deployment.
- The full AI suite finished with 304 passed and 1 failed: a separate Business Partner `assessment_scope` guidance regression (`No quota expected`), outside the reference qualification. Track it before that family's gate closes.

## Shared record navigation and reference preview (2026-10-01)

The deployed shared detail runtime now supplies an Overview tab and continuous sections when an authorized presentation declares an `overview` section but omits navigation. Explicit published navigation and legacy presentations without an Overview section retain their behavior. Default overview headings that repeat the collection title use the published singular entity label. Single-section records omit the section picker. Section/summary layout preferences are shared within the same plane, tenant and principal; collaboration tabs still require published, authorized capabilities.

Reference detail fields display an underlined label and source code, with a real canonical Entity record link. A normal click opens the existing workspace tool panel; modified clicks, middle clicks and the browser context menu retain standard link behavior. The panel supports pin/unpin, a mobile drawer and an explicit **Open record** link. It does not create a second page route or change the main page's Atlas business context.

The Records reference reader returns `references` coordinates only after checking the source mapped fields and the target collection, record, key fields and label. Composite mappings use the existing locked mapping resolver; URLs use the resolved record UUID, never the raw reference code. Missing, denied, masked or ambiguous references have no preview coordinates. The record contract rejects invalid coordinates and coordinates whose source value does not match the projected record.

On preview open, the client rereads the source through the standard authorized detail API and verifies the relationship still identifies the selected target, then reads the target through that same API. The preview renders authorized default-list fields (at most eight), published title and status badges using the shared field renderer. It currently uses the default-list metadata fallback, not a separate custom preview-profile authoring contract. Errors reveal no target values or Open record action. Session, permission, experience revision, business-context generation or source-record changes hide the preview immediately and cancel outstanding reads. No record contents are saved in browser preferences.

DEV Neon qualification: all six Overview layouts and singular headings; Johor → Malaysia preview; pin/unpin; Open record; Ctrl-click new tab; mobile drawer; no browser errors. Private evidence: `~/.athyper/instances/dev/evidence/reference-preview-20261001/report.json` and adjacent screenshots. Reproduce with `qualify-reference-preview-dev.mjs <baseline-browser-report> <private-output>` and the trusted DEV CA / ordinary saved Neon session.

Checks: 56 focused Records tests, two reference-contract checks, 20 preview/navigation browser checks, and the enum status browser check passed. Form-detail, Entity runtime contract, i18n and Records typechecks passed. Source-mounted DEV consumes these shared framework changes with the already active metadata releases; no new publication policy, activation-head edit or business-data mutation was used. This does not replace the outstanding reviewed-commit and remote-CI release evidence.

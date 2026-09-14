# Shared entity intake

Entity intake uses the existing `metadata.entity_flow` and
`metadata.entity_flow_step` authoring records. It does not introduce intake
definition tables or replace the case approval workflow.

## Publication and runtime

The native runtime projection compiles active flows into `intakeFlows` on the
entity descriptor. Compilation checks operation and surface references, step
ordering, unique keys, and supported conditions. The application descriptor
passes these flows to the authorized entity UI. Descriptors without flows retain
their existing shape and behavior.

Conditions use declarative `present` and `equals` checks against adapter-provided
answers. They are navigation guards, not authorization or server validation.
Existing operations remain responsible for permissions, organizational scope,
validation, idempotency, and submission.

## Reusing the UI

1. Author a flow and its ordered surface references in the existing entity graph.
2. Load the published application descriptor and select the flow by key. Mount
   `EntityIntake` with that flow and descriptor hash; remount when the hash changes.
3. Supply an entity adapter for the declared surfaces and step keys. The shared
   runner controls progress; shared surfaces render configured fields, while adapters own authorized operations and business rules.
4. Use `EntityIntakeForm` for the details/review boundary. Its first submit captures
   the review without calling the mutation handler. Final submission invokes the
   adapter's existing operation handler after checking required steps.
5. Invalidate progress from the affected step when earlier answers change. Supply
   `reviewValues` when the default labeled form-control summary needs additional
   context or formatting.

The entity application hosts `EntityTaskHeaderProvider`. During intake, the task
registers its title, step description, Cancel action, and progress navigation in
that existing header. Overview/Manage return when the task unmounts. Nested
`PageSurface` components use `contentOnly` to avoid duplicate headers.

## Business Partners pilot

`withBusinessPartnerIntake` adds the `request_intake` flow to the existing graph:
Partner → Details → Review & submit. Partner selection chooses supplier/customer,
searches existing identities, and routes to onboarding or missing-role details.
Final submission creates the existing request case, validates it, and submits it
through the existing approval API. If validation/submission fails after creation,
the user receives the saved case to correct or retry rather than another intake.

The pilot has `allowDraftResume: false`. Back navigation retains mounted form
values; leaving the page does not save a pre-submission draft. For entities that
enable resume, the adapter must persist answers and `IntakeCheckpoint` through
its authorized draft service and provide `saveCheckpoint` and
`initialCheckpoint`. Checkpoints are pinned to the descriptor hash. The shared
runner alone is not a durable draft store.

## Verification and rollout

Compiler and UI fixtures exercise a Product request with different step keys,
proving reuse independently of Business Partners. Product is a test fixture, not
a deployed second-entity workflow. Tests cover linear navigation, condition
checks, revision-pinned resume, shared-header cleanup, retained answers, and
single final submission. DEV browser verification covers the published Business
Partners customer path through review and Back without creating business data.

Before enabling another production entity, publish its own flow, bind its
surfaces to an adapter, and verify its authorized create/validate/submit path.

## Metadata-rendered choice surfaces

The choice-card pilot extends the existing graph instead of introducing intake
schema tables. Surfaces opt in with `layout_config.renderer = "intake"` and
`columns` of 1 or 2. `entity_surface_section` defines ordered groups; active
`entity_surface_field_binding` rows select the registered `choice_cards` widget.
The compiled control identifier is `choiceCards`.

### DDL audit and mapping

Reviewed Studio metadata domains, tables, foreign keys, graph-validation
functions, triggers, and RLS, plus the common control lookup tables:

| Existing structure                          | Pilot use / constraint                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata.entity_field`                     | `value_origin = runtime`, `write_mode = mutable`, no storage path; temporary answers are excluded from record storage projection                                 |
| `entity_field.type_config`                  | String type with maximum length; enums require a real `domain_code`, not inline options                                                                          |
| `entity_field.validation_spec`              | Existing version-1 rule collection containing `allowed_values`                                                                                                   |
| `metadata.entity_surface`                   | Form surface, opt-in renderer, one/two-column presentation                                                                                                       |
| `metadata.entity_surface_section`           | Section headings, descriptions, ordered placement                                                                                                                |
| `metadata.entity_surface_field_binding`     | Label/help override, widget key, requiredness and option presentation in `display_config`, declarative `visibility_rule`                                         |
| `metadata.entity_flow` / `entity_flow_step` | Existing journey and surface references                                                                                                                          |
| `control.lookup_domain` / `lookup_value`    | Existing infrastructure for independently governed domains; this finite-choice pilot uses field-local allowed values and does not create duplicate domain tables |

`metadata.trg_validate_entity_field_contract` restricts enum configuration to
`kind` and `domain_code`. It also requires validation to use `schema_version`
and `rules`. The pilot uses those established constraints: it does not put
inline options in enum type configuration or invent a `required` validation
rule. Requiredness here is a surface progression rule; authoritative business
validation remains in the owning backend.

Stored draft saves exercised the database constraints in DEV. No DDL change or
migration was necessary. Normal graph ownership, tenant scoping, immutable
publication, and optimistic revision checks remain in force.

### Compiler and runtime boundary

`compileEntityIntakeSurfaces` is a pure shared contract projection used by Studio
validation, Studio surface preview, and the native runtime adapter. It validates
references, unique ordering, supported controls, allowed-value/option agreement,
and declarative conditions. Unsupported nested/collapsible sections and
editability rules fail explicitly in this first renderer.

Only validated, storage-free runtime choice inputs are excluded from record
field-policy coverage. All stored fields and unbound runtime fields retain the
existing authorization checks. This does not grant read/write operations or
bypass the entity adapter. Restoration checks still cover the reviewed record
fields, operations, and policy payload.

The shared `ChoiceCards` control uses native radio inputs. `EntityIntakeSurface`
renders sections and labels from compiled metadata. `EntityIntakeClassification`
validates and hands only active allowed answers to its supplied adapter callback,
along with the surface key and publication hash. Unknown and inactive answers
are excluded. It prevents concurrent handoffs and preserves selections after
handler errors. Changing answers invalidates the corresponding intake step when
hosted in a flow.

Options may declare `availableWhen` and `unavailableReason`; fields may declare
`visibleWhen`. Conditions support the existing `present` and `equals` operators
and must reference another field on the surface. Cyclic dependencies are rejected.
The pilot does not implement arbitrary expressions, a general asynchronous
handler registry, external option-domain resolution, or localized option maps.
Entity integrations supply typed callbacks; existing partner lookup/role checks
remain in their authorized adapters.

### DEV pilots and review

- **Business Partners:** `request_intake` / `intake_partner`; the published
  `requested_role` cards replace the dropdown. A compatibility dropdown remains
  for older publications so metadata rollback remains usable. Role presentation
  comes from the new descriptor whenever the surface is present. Partner search
  remains the existing entity-specific UI and API.
- **Invoice:** `supplier_invoice` has a saved tenant-scoped Classification draft.
  It is registered under the Studio metadata module with a virtual, catalog-only
  profile. It defines Invoice type, Invoice basis, and Supplier relationship.
  There are no financial operations or stored invoice fields in this draft.
- **Studio:** Open **Entity → Graphs**, select the Invoice draft, and choose
  **Preview intake surfaces**. This uses the same surface projection and renderer
  against the editable graph. **Check classification** exercises the typed
  handoff without creating a business request. Editing metadata resets preview
  answers; invalid metadata produces an explicit preview error.
- **Neon:** A classification-only route exists at
  `/supply-chain/procurement/invoices/classification`, ready to consume a published
  Invoice application descriptor. Activation is not available until Invoice has
  a qualified operational runtime and authorization registration. The draft's
  runtime-preview failure is distinct from its working Studio presentation
  preview. No runtime registration or approval authority was fabricated.

Business Partners activated at draft revision 26. Invoice draft
`66022d8c-6d11-4d5d-85d5-4b5d0b967167` saved at revision 1. These are personal DEV
coordinates, not production release identifiers.

Invoice types are pilot vocabulary. Financial eligibility combinations and final
business wording require domain configuration before operational use; no rules
were inferred from the sample image. Classification review is the current scope,
not invoice creation or approval.

### Verification

Compiler and UI tests exercise both entities, requiredness, domain mismatches,
invalid dependencies, answer sanitization, failure retention, and duplicate
handoff prevention. Integration tests verify unchanged record fields and grants.
Authoring/restoration tests verify that storage-backed and unbound fields cannot
use the presentation-only exception. Browser verification exercised the stored
Invoice draft at desktop and narrow widths and the published Business Partners
role cards and customer search, with no page errors or financial mutations.

### Choice-card presentation presets

Field bindings now accept these optional `display_config` properties:

| Property        | Supported values         | Default                       |
| --------------- | ------------------------ | ----------------------------- |
| `layout`        | `stacked`, `grid`        | `stacked`                     |
| `optionColumns` | `1`, `2`                 | `1` for stacked; `2` for grid |
| `density`       | `compact`, `comfortable` | `comfortable`                 |

A stacked layout requires one column. Unsupported values and inconsistent
combinations fail authoring validation and compilation. The compiled field carries
these presets under `presentation`. Absent configuration preserves the original
stacked, comfortable rendering.

For example, Business Partners' `requested_role` binding uses:

```json
{
  "widgetKey": "choice_cards",
  "displayConfig": {
    "layout": "grid",
    "optionColumns": 2,
    "density": "compact"
  }
}
```

Merge these properties into the existing display configuration; retain its
`required` flag and `options`. Layout applies to the options within one field,
independently of the surface's section columns. Two-column choices stack at the
shared narrow-screen breakpoint. Typography, brand colors, borders, focus states,
and spacing values stay in platform CSS/design tokens. Metadata cannot provide
CSS or arbitrary pixel dimensions. Radio position remains the shared component's
standard placement.

Business Partners activated with this configuration at DEV revision 27. Invoice
keeps its existing stacked, comfortable choices. Browser checks cover desktop and
mobile columns, native arrow-key selection, and unchanged partner search.

## Shared entity lookup and reference chooser

The Business Partners `intake_partner` surface now includes an `entity_lookup`
field binding. Its `display_config.lookup` compiles to the `entityLookup` control.
The seed helper `withBusinessPartnerLookup` adds the section/field/binding once and
preserves existing authored role-card configuration. DEV activation through the
normal Studio graph API completed at revision **28** on 2026-09-12. No DDL was
added: `metadata.entity_surface_field_binding.widget_key` and `display_config`
already support the widget identifier and bounded JSON configuration.

The shared `EntityLookup` renders compact search or the existing
`EntityListRuntime` with an embedding contract. It does not copy the directory
markup. `presentation.viewType` is `compact` or `full`; `fullViewHost` is `inline`
or `dialog`. Full/dialog starts with a user-operated trigger. Compact can expand
inline or open a dialog. Search/view state stays local to the lookup, leaving the
parent URL unchanged. Dialog confirmation commits provisional selections; Cancel
and Escape discard them and restore focus. Nested settings dialogs close before
the parent chooser. Embedded tables use their own scroll host, with mobile record
cards and stacked toolbar controls.

Supported lookup configuration:

- `mode`: `browse` (requires selection `none`) or `choose` (requires `single` or
  `multiple`, with `recordAccess: readOnly`). Existing standalone Manage retains
  its separate bulk-action selection behavior.
- `recordAccess`: `readOnly` removes record-management actions; `manage` remains
  permission constrained. This is presentation restriction, never a permission
  grant. Registered creation is separate from editing a listed record.
- `creation`: `showIn` lists `compact` and/or `full`, with `actionKey` and `label`.
  The registered adapter must explicitly support that creation key. Creation is
  offered only after successful lookup/list loading. Conditional action labels
  support supplier/customer onboarding without putting domain logic in metadata.
- `display`: `settingsShowIn`, `defaults`, `userOverrides`, `preferenceScope`.
  Reuses existing presets: layout `table|compact`, density
  `compact|comfortable|spacious`, search behavior `instant|submit`. The existing
  settings UI is reused; compact settings opens that UI through the full host.
  Surface preferences are keyed by target, authorized scope fingerprint, and
  binding key, separately from ordinary Manage. Application scope is opt-in.
- `views`: `defaultViewKey`, optional `allowedViewKeys`, `allowSwitching`, and
  `usePersonalDefault`. Published standard keys and compatible saved-view IDs use
  the existing view catalogue and filter query compiler. Both compact search and
  full results apply the same active view. Embedded Manage views permits choosing
  available views, without changing shared or personal startup defaults. Default
  filters are not eligibility constraints; adapters/server validation retain that
  responsibility.
- `recent`: `enabled` and bounded `limit` (1–20). Requires an adapter-provided
  user/tenant/work-context scope and authorized `resolveRecent` handler. Only IDs
  are stored in optional device history; displayed rows are resolved again.
- `result`: title fallback keys and detail keys; labels and messages remain
  metadata. Styling remains platform tokens, with no arbitrary CSS or endpoints.

The registry owns an authorized client, selection handlers, and explicitly
registered creation actions. The target entity must match the registration.
Business Partners continues through the existing role-extension/onboarding and
approval code. Its search spans roles, so an existing customer can be reused as
an identity for supplier onboarding. Legacy publications without the lookup
binding retain their prior search UI for compatibility.

`EntityReferenceLookup` reuses the same control for reference assignment. It
checks `one|many` cardinality against `single|multiple`, requires a registered
`validateSelection` handler, and returns an ID/null or ID array to the calling
form. Multiple selection retains explicit IDs across pages; page-wide selection
is limited to the current page. Reference labels/rows are not stored as the
reference value. Integration tests use a Product reference to verify single and
multiple assignment; this does not activate a new operational Product surface.
The intake compiler continues to accept only validated storage-free runtime
inputs, and excludes lookup queries from submitted intake answers. Wiring an
existing stored reference field uses the reference wrapper and its normal form
binding, not a fabricated intake string field.

Verification covers compiler/authoring restrictions, unchanged directory
behavior, all four host combinations, single/multiple selection, reference
eligibility rejection, cancellation/focus restoration, aborted stale searches,
nested settings, and desktop/mobile layouts. The live DEV Business Partners page
was checked with both roles, one lookup panel, and no case-creation mutations.
The authorized live directory was empty; selection behavior was exercised using
controlled record fixtures rather than creating production-like partner data.

## Permission-only request entry and shared lookup actions

The next Business Partners pilot patch uses
`entity_surface.layout_config.experience.operationEntryPolicies`:

```json
{ "request_supplier": "permission_only" }
```

The key references the existing operation and its exact-plane permission binding.
The list-experience compiler retains its permissions, scope bindings, and rules;
`effectiveListActions` applies this entry rule only to the published navigation
link. It checks the installed operation binding and operation permission without
requiring an organization/company coordinate or command preflight. Explicit deny
and unresolved capability/lifecycle rules still prevent navigation. Command
execution, organizational eligibility, write preflight, and submission retain
normal server authorization. Both supplier and customer request paths currently
use `neon.relationship.entity_case.create`; no new role grants are introduced.

This is intentionally separate from the signed authorization profile and its
canonical-read admission hash. The migration preserves both `authorization` and
`authorizationRuntime`, along with all operation scope bindings. No authorization
or lookup tables are added. Existing Studio surface JSON columns carry the rule.

Lookup adapters now expose `resolveActions(signal)`, returning independent
`select` and registered `creation` decisions (`hidden|disabled|enabled`, with an
optional reason). Missing or failed decisions cannot execute actions. Decisions
refresh on answer changes/window focus and are resolved again before execution.
Business Partners obtains its decision from the same application-descriptor
`new_supplier_request` action as Manage. Its selection handler re-reads the
selected partner through the authorized record endpoint; role-specific checks
continue in Details after the operating organization is supplied.

Reference adapters must resolve their own parent-form/field assignment authority;
they do not inherit Business Partner onboarding permission. Reference assignment
still requires cardinality and `validateSelection`. Optional intake validation
runs before continuation too. These UI decisions never replace server checks.

Lookup `messages` supports `emptyTitle`, `emptyDescription`, `noMatchesTitle`,
`noMatchesDescription`, and `selectMultiple`. Single confirmation uses the
configured `select` action label. Business Partners uses “Use selected partner”,
“No business partners to display”, and “No matching business partners found”.
Creation guidance is displayed only with an available authorized creation action.
An empty directory places creation inside the empty state, suppressing duplicate
footer creation and selection confirmation. A populated directory keeps the
primary selection confirmation in the footer, with secondary creation and a
left-aligned dialog Cancel. Network/authorization errors are not empty results.

`withBusinessPartnerEntryPolicy` is an idempotent, targeted authoring migration.
It preserves unrelated rows and JSON settings and is saved with `expectedRevision`
through Studio. The patch was saved through Studio and activated in DEV as revision **29**
on 2026-09-13 (Malaysia time), after renewing the time-limited authoring grant
and the MFA session. The activation contract hash is
`e7bf9d79c20746f78e5e0717eade26d09731d9723f5ede3d1a456cef742c8e18`.
Live post-publication checks passed with the renewed Neon session: Manage request
entry is enabled, both role-specific intake actions are enabled, and the empty
directory renders one creation action with no selection confirmation. Customer
onboarding continues to Details without creating a case. Desktop/mobile checks
reported no browser errors.
Local shared-renderer browser tests pass for all four host combinations,
selection/cancellation, focus, and mobile behavior. Operational reference reuse
is demonstrated with fixture records; it does not migrate a second entity's
production form automatically.

Focused verification for this follow-up: 95 tests passed across Business Partner
intake/lookup, records action resolution, Studio compiler/restoration, intake
projection, and directory embedding. Changed frontend packages, Studio, metadata,
and records service source typechecks passed. The records service broader test
typecheck still reports unrelated fixture errors in canonical-read and navigation
context tests. A local copy of the pilot graph compiles after the targeted patch,
with authorization and canonical-read admission unchanged. The initial live check showed the old context rule before publication; the
post-publication revision-29 check confirmed enabled request entry.

### Metadata-rendered supplier Details (DEV revision 30)

The supplier onboarding Details form now renders `intake_details` using the
shared `EntityDataSurface`. Organization identity, addresses, contacts, and nested
communication channels no longer have separate Business Partner React layouts.
The authorized organization chooser and relationship payload builder remain
registered/domain code. Customer onboarding's separate Details form is outside
this three-section migration.

Existing tables carry the definition; there is no DDL migration:

- Surface `layoutConfig.renderer: "intake"` opts in; `formLabels` defines the
  continue and draft-submit labels.
- Surface sections define titles, descriptions, order and column count.
- Runtime entity fields declare scalar/JSON types and remain excluded from
  record storage and record-field policy coverage by the existing compiler.
- Field bindings use `widgetKey: "input"` or `"repeatable_group"`. Binding labels,
  help text, placeholders, spans and visibility rules feed the shared renderer.
- Input `displayConfig` defines `valueKey`, widget, required/default/maxLength,
  normalization, lookup source/options, registered handler and payload mapping.
- Group `displayConfig` defines `valueKey`, `itemSurfaceKey`, item/add/remove labels,
  min/max bounds and optional primary field/label. The primary field must reference
  a checkbox on the item surface. Exactly one primary is required in a nonempty
  configured group. Removing the primary transfers it to the first remaining row.

The three item surfaces are `partner_address_intake`, `partner_contact_intake`,
and `partner_channel_intake`. References must resolve within the published set;
cycles, excessive depth/expanded size, duplicate answer keys, unsupported widgets,
field-type mismatches and unsupported field rules fail compilation. Row keys stay
stable across edits/add/remove. Hidden and undeclared values are removed before
the Business Partner adapter constructs the command.

Registration and address country bindings use `lookup.sourceKey: "iso.country"`.
The application descriptor resolver loads `shared.country`, resolving each source
once per request. It replaces embedded options and never falls back to the old
four-country list. Live DEV currently returns 247 countries. Existing published
Business Partner bundles remain historical/domain schema contracts; the current
supplier UI's compatibility serializer descriptor is generated from the active
Meta Entity surface, not those bundles' presentation fields. The request still
pins `expectedForm` to the authoritative business schema release. Meta Entity
presentation validation does not replace server permission, scope, schema,
relationship or approval validation, nor does editing UI metadata relax them.

`withBusinessPartnerDataSurfaces` imports the currently published supplier form
once and adds bounded item surfaces. It refuses field collisions or replacement
of already-authored Details bindings and leaves subsequent author edits alone.
The reviewed graph was saved with `expectedRevision` through Studio and activated
as DEV revision **30**, hash
`e4a33e06cb0d3ef96d296d957c4864e748567196810e7ce59d7793d2db36e8ba`.
Authorization profiles, operation permissions, execution scopes and flow mappings
were compared before/after and preserved.

Verification covers native compilation, metadata-only label/layout/required and
visibility changes, country-source hydration, nested collections, stable keys,
primary transfer, bounds, hidden values and legacy payload mappings. An Invoice
line-item fixture demonstrates reuse of the same control; no operational Invoice
form was migrated. Live desktop/mobile checks passed. The filled Details screen
reached Review and emitted the expected create command with relationship links;
the browser intercepted that command before any server mutation. No live request
or approval was created by this verification. Existing request-service validation
and authorization tests pass separately.

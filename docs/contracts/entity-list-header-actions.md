# Entity list header and actions v1

Status: implemented for collection header presentation and navigation actions.
This contract does not authorize execution. Every destination and mutation must
continue to enforce its own operation and policy checks.

## User experience

The entity application header has a title row and an optional description row.
Collection result counts belong to the list footer.
There is no entity/Manage eyebrow and no global Read-only badge or lock icon.
Neither an unavailable inline editor nor permission to read establishes whether
a principal may create a record, import changes, or start a governed request.
Enabled actions are links. Inaccessible actions are omitted. Context/preflight
requirements produce a non-executing, keyboard-focusable action with a visible
explanation. A disabled action never contains a destination URL.

## Ownership and database lineage

The authoring tables are owned by Studio's `metadata` schema:

- `entity` owns the entity identity and change set.
- `entity_surface` owns the list title, optional description and layout configuration.
- `entity_surface_operation` joins a list surface to an operation and defines placement,
  position and optional label override.
- `entity_operation` owns the operation key, label and input/result surface reference.
- `entity_operation_permission` binds an operation to a permission in a target plane.
- `entity_operation_rule` holds plane, lifecycle and capability conditions.
- `entity_operation_scope_binding` declares the decision mode, coordinate source and resolver.

These are not separate editable copies of the authoring graph in MESH.
The active contract and compiled descriptor are read through
`runtime_meta.release_activation_head`, `runtime_meta.applied_release`,
`runtime_meta.entity_contract`, and `runtime_meta.entity_descriptor`.
The common `authz.entity_operation_binding` and
`authz.entity_operation_scope_binding` DDL applies to runtime planes, including
MESH. The IAM resolver reads the installed bindings into the verified permission
snapshot. Metadata artifacts and authorization bindings must be published together.
Do not query Studio tables from a browser or substitute a browser permission check.

## Published contract

`listPresentation.experience` is an optional, versioned v1 extension of the
existing runtime descriptor. Its parser is the contract boundary.

- `header.title` is localized text; `header.description` is optional localized text.
- `header.iconKey` optionally references the existing semantic icon registry.
- Localized text contains `defaultLocale` and a map of BCP-47 locale tags to text.
  The default translation is mandatory. Locale selection uses exact tag, parent
  tags, then the explicitly declared default. English pluralization is not used
  for localized titles. Locale changes select text without refetching authority.
- `routes` registers active surface keys and static same-origin paths.
- `actions` is compiled from surface-operation joins, not separately authored
  permission strings in a component. It contains operation and target references,
  localized label, placement, position, plane permissions, rules and scopes.

Author optional translations and registered destinations in
`entity_surface.layout_config.experience`:

```json
{
  "defaultLocale": "en",
  "header": {
    "title": {
      "defaultLocale": "en",
      "values": { "en": "Business Partners", "ms": "Rakan Perniagaan" }
    },
    "description": {
      "defaultLocale": "en",
      "values": { "en": "Partners available in the selected organization." }
    }
  },
  "routes": [
    {
      "surfaceKey": "supplier_request_form",
      "href": "/mdg/business-partner/new"
    }
  ],
  "actionLabels": {
    "new_supplier_request": {
      "defaultLocale": "en",
      "values": {
        "en": "New supplier request",
        "ms": "Permohonan pembekal baharu"
      }
    }
  }
}
```

This is entity metadata, not a frontend registry. The target surface must exist
and be active in the published graph. The placement key in `actionLabels` must
correspond to a surface-operation binding. Its linked operation must reference
that target and have plane-specific permission bindings. An entity name or
relationship does not imply an onboarding flow. Flow entry forms can be used as
explicit input surfaces; arbitrary workflow execution is not a header link.

The compiler rejects missing operation/permission/target references and multiple
primary actions. The parser rejects unsupported versions, missing default
translations, duplicate keys, invalid coordinate-source combinations and unsafe
URLs. Actions are ordered by position and stable key. Translation/presentation
changes participate in the surface hash.

## Effective runtime projection

For each published action, the records service:

1. Selects its exact-plane permission and checks installed operation bindings.
2. Checks the installed scope requirements against the published scope declaration.
3. Calls the authorizer with tenant, entity, operation and server-resolved work context.
4. Verifies required coordinates and relation-resolver provenance.
5. Applies unconditional plane rules with deny precedence. Allow rules never grant
   a missing permission. Lifecycle/capability/visibility conditions without evaluated
   evidence require preflight and cannot enable a collection action.
6. Emits only effective presentation through the existing descriptor `actions` array.
   Permission bindings and rule internals are not emitted to the browser.

Published conditional actions currently remain disabled until an authoritative
preflight integration can supply their missing evidence. This implementation does
not pretend that a capability code is an IAM permission. Navigation does not run a
mutation, so endpoint authorization remains mandatory even after an enabled link.

The shared list renders `surface.header` and `actions` exclusively. Entity-specific
`pageActions` and `headerDescription` overrides have been removed. The Neon wrapper
retains its existing organization-scope adapter; this contract does not replace the
domain resolver for row access.

## Compatibility and rollout

Older descriptors retain their metadata `surface.title` and description. They
have no synthetic header actions. They do not acquire a guessed Create action or
a Read-only badge. New authored list surfaces compile localized header data.
To restore a Business Partner request action, publish its actual surface-operation,
permission and scope bindings; the previous unconditional shortcuts are removed.
On 2026-09-07 the local development rollout published global Business Partner
release 10 and the CirrusAtlantic override release 2, including the translated
header and `request_supplier` operation. Existing role grants, record fields,
and storage configuration were preserved. This is a local development metadata
projection; it does not publish to QA or production.

The reproducible local rollout script is
`server/db/scripts/provisioning/publish-development-list-experience.ts`:
run without flags to prepare a plan, `--rehearse` to stage/verify/activate inside
a rolled-back transaction, then `--apply` to commit the reviewed plan. The script
checks the active release has not changed, validates hashes and the descriptor,
and preserves existing artifacts for rollback. It uses the system audit actor
and only the `athyper-dev-db-1` / `athyper_neon` local target. The authored header
graph is retained in the new contract's `listExperienceGraph`.

Loading uses the same header, query toolbar and table structure. No entity label,
record count, permission status or clickable action is invented while metadata
is unknown. Neon waits for company/organization bootstrap before requesting list
authority, and server-provided initial density preserves compact URL spacing.

The current result count stays in the list response and reflects authorized query
scope, filters and count mode. Record-specific mutation actions remain separate and are not inferred
from this collection header contract. Navigation and optional attention bindings
are described below.

## Entity section navigation

`listPresentation.experience.navigation` extends schema version 1 additively.
Older publications without it expose no invented sections. Each navigation
placement is authored through a surface-operation binding (`navigation` or
`navigation_overflow`); labels use `actionLabels` and section options use
`layoutConfig.experience.navigation[placementKey]`:

```json
{
  "review": {
    "kind": "review",
    "workflowKey": "supplier_onboarding"
  }
}
```

Kinds are `overview`, `manage`, `review`, and `function`. Permissions, scope
bindings, rules, ordering, and target surfaces are compiled from the referenced
operation, as for header actions. The review kind requires a workflow reference.
Publication validates an active entity flow with a step referring to the target
surface. An optional `attentionCountKey` must be in the compiler's registered
count-resolver allowlist. It is not a database expression or executable query.

The server reuses operation authorization and hides denied or unresolved
sections. It returns only accessible destinations, localized labels, direct or
overflow placement, and optional verified counts. The list descriptor identifies
its current surface, so both list URL aliases select Manage. Registered route
aliases are validated as safe, unique same-origin paths. A section has one target;
duplicate section keys, target surfaces, and route paths are rejected.

Count adapters are injected into `createEntityListService.attentionCounts` by
stable key and receive verified context, the descriptor, and resolved scope.
They must enforce assignment and row visibility themselves. They run only for an
authorized section with ready scope. Missing, failed, or invalid results stay
unknown; only positive verified counts render a badge. No Business Partner count
adapter is published yet: tenant-wide pending totals cannot establish what the
current user needs to do.

The shared navigation uses semantic links with one `aria-current="page"`,
localized labels, and an accessible native disclosure for overflow. Empty
navigation and empty More menus are omitted. During authority bootstrap the
navigation row is a noninteractive skeleton. Module destinations reuse the same
resolved navigation without querying list rows or rewriting their URLs.

Local development navigation rollout: global Business Partner release 11 and
CirrusAtlantic override release 3 were published on 2026-09-08 for Overview, Manage, and Review
& Approval. New supplier request remains a primary header action. MESH Proposals
is excluded because its existing three-segment permission
`neon.business_partner_profile_projection.read` cannot be installed by the
four-segment canonical entity-operation publication contract. Its permission must
be migrated before publishing a navigation binding; this rollout does not bypass
that validation or change role grants.


## Shared entity application

The optional `experience.application` binding declares `key`, `basePath`, and
`defaultSectionKey`. Each published navigation section declares `content`:
`overview`, `entity_list`, `task_list`, or `custom`. Collection content requires
an explicit `entityCode`. The compiler accepts external collections only from
its registered collection allowlist; it never guesses them from relationships.
The default section must exist and the application base path must be registered.
This is an additive schema-v1 extension; older entities keep their collection
fallback until their application metadata is published.

`GET /api/entity-runtime/:entityCode/application-descriptor` resolves the common
header, effective actions, accessible navigation, and scope. It does not return
record fields or query records. Application access can come from an authorized
section operation, so request access does not implicitly require master-record
read access. Each collection separately obtains its own authorized list
descriptor and queries. The request-only case has a server regression test.

Neon's shared application layout retains the header across tab navigation.
Business Partner uses these published destinations:

- `/mdg/business-partner`: Overview, currently an empty content area.
- `/mdg/business-partner/manage`: shared master-record collection.
- `/mdg/business-partner/requests`: shared governed-request collection.

The old `/partners` and `/business-partners` suffixes redirect to `/manage` while
preserving repeated query parameters and saved-view IDs. Saved views are separated
by application, section, and collection. Existing master-list saved views migrate
to its Manage namespace; they are not copied to the request collection.

The request collection explicitly binds `business_partner_request` to
`document.entity_case`. Its published relationship and generic resolver constrain tenant,
`master.business_partner`, and the operating organization in the current
`snapshot.entity_snapshot`, matching the native request service. It requires the
existing entity-case read permission. Opening a request continues to use the
native workflow detail and decision checks. This collection is not a per-user
assigned task queue: personal attention counts still require a registered adapter.

Overview AI, recent items, and metrics remain unconfigured. No fabricated cards
or counts are displayed. Additional entities need their own published application
and collection bindings; the shared UI contains no inferred onboarding flow.

Local dev application rollout on 2026-09-08 activated Business Partner global
release 12, CirrusAtlantic release 4, and request collection release 1. Both API
and Neon production images were rebuilt and the dev containers are healthy.
Validation passed 53 focused tests, relevant typechecks, publication rehearsal,
and an SQL comparison with the native request scope (43 records, zero mismatches).
HTTP smoke checks reached all three routes; the legacy route emits the canonical
redirect with query parameters. Authenticated browser interaction was not verified
in this rollout.

The application descriptor GET must also be registered in each hosting BFF's
explicit relay allowlist. The 2026-09-08 follow-up adds this missing registration
and tests exact-path forwarding with all work-context query parameters; arbitrary
methods remain rejected. Application failures replace the loading header with a
theme-token-based retry panel, with diagnostics in a collapsed details disclosure.

## Document relationship scope v1

Request descriptors declare `collectionRelationship` independently of the parent
application section. Example published Business Partner request binding:

```json
{
  "schemaVersion": 1,
  "sourceRef": "entity_case",
  "subject": { "fieldRef": "subject_entity", "value": "master.business_partner" },
  "scope": {
    "fieldRef": "current_snapshot.organization",
    "contextRef": "operatingOrganizationId"
  }
}
```

The server metadata contract owns `documentCollectionRegistry`: registered storage
shapes and typed relationship fields, shared across subject entities. Version 1
registers the entity-case/current-snapshot organization path. Other document storage
shapes require a reviewed registry extension; another subject using this shape
requires only metadata, not another resolver branch. Arbitrary SQL, JSON paths,
context names, storage mismatches, and unsupported versions are rejected.

Authoring can declare the binding in a surface's `layoutConfig.collectionRelationship`.
The compiler permits one binding per entity and includes it in the compiled artifact.
Runtime descriptor parsing validates the binding against actual root storage.
The collection's read permission remains separately declared and authorized.

Neon validates the selected organization and optional company/legal-entity pair,
then emits `platform.document_relationship.v1`. The SQL adapter reads the binding
from the server descriptor and compiles the subject equality and tenant-correlated
relationship existence check using bound values. The subject discriminator is never
provided by a browser filter. Missing relationships for the registered document
shape fail closed. The relationship participates in scope fingerprints, invalidating
old cursor authority when its meaning changes. Snapshot-backed constraints also
fail closed in the in-memory repository.

This replaces the Business Partner **request** resolver branch. The existing master
record assignment resolver is separate and is not changed by this document migration.
The local revision script `server/db/scripts/provisioning/publish-document-relationship.ts`
prepares a plan, supports `--rehearse` (rollback) and `--apply`, checks the activation
head and content hashes, and preserves historical publications and existing grants.

Local-dev request release 2 was activated on 2026-09-08 with the generic binding.
The rebuilt API is healthy. Validation: 31 focused tests, relevant typechecks,
publication rehearsal, and compiled SQL comparison (43 requests, zero differences).

## Reactive entity breadcrumbs

Neon's router supplies its current pathname through `ShellRouteProvider`. The
persistent shell uses that reactive path for breadcrumbs and route access instead
of retaining the URL from its initial mount. The loaded entity application
registers only its effective section destinations and localized labels. Breadcrumbs
retain the catalog workspace/application ancestors and append the matching section
label (including Overview at the application root). Legacy aliases match the same
section. Unmounting the application, loss of descriptor authority, or a locale
change clears or replaces its registration; unrelated pages retain catalog-derived
breadcrumbs. No Business Partner-specific breadcrumb labels or route switches are
introduced. Browser history is reflected through the router's pathname updates.

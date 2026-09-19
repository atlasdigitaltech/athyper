# Entity saved views

Entity lists use the platform preference service rather than browser storage for
new personal and shared views. The System default is the current published list
configuration and is never an editable saved-view record.

## Audience, identity and authorization

Views are scoped by plane, tenant, collection entity and surface namespace. The
entity application supplies `application.section.collection` as the surface;
personal defaults additionally include the authenticated principal. Shared views
are tenant-wide. Explicit visibility never changes row access or work context.

The service resolves these registered permissions against tenant, entity and
surface and rechecks them at mutation time:

- `<plane>.ui.saved_view.create_shared`: publish a shared view.
- `<plane>.ui.saved_view.manage_shared`: rename, update or archive shared views,
  including views created by another administrator.
- `<plane>.ui.saved_view.set_shared_default`: select the tenant starting view.

Restricted organization grants cannot establish tenant-wide publishing authority.
Personal views remain owner-only, even for shared-view administrators. Legacy
share/update/delete endpoints enforce the same shared-view permission checks.
No role names are checked by React, and this rollout assigns no new role grants.

## API and validation

`GET /api/entity-runtime/:entityCode/views?surface=...` returns accessible views,
compatibility, personal and tenant defaults, and effective shared-view capabilities.
`POST` on the same route accepts `create`, `update`, `delete`, `copy`, and `default`
commands. Both are explicitly allowlisted by the BFF; writes require its normal
CSRF/session checks. The collection descriptor/read authorization is resolved
before accessing stored views. Cross-collection view IDs are rejected.

Updates require the persisted view version (`xmin` through the existing service),
with stale versions rejected. Views save columns, filters, sort, grouping, layout,
spreadsheet presentation and density. Search, pagination and work context are
excluded. Unavailable columns, filters, sorting or grouping make a view incompatible;
filters are never silently removed to broaden its intended query. Actual record
queries still enforce current field and row permissions.

## Defaults and browser behavior

Resolution order: explicit URL state, personal default, tenant default, published
System default. `vid=system` explicitly selects System default, including on refresh.
A personal System default overrides the tenant default. Missing or incompatible
saved defaults fall back to System default with a status explanation.

Applying/resetting a view does not change the startup preference. The Manage views
drawer exposes separate personal and tenant default actions. The toolbar picker
always offers System default and Manage views. Shared views can be copied into a
personal view; publishing and managing originals require separate permissions.

Existing browser-local views remain readable and are marked "This browser". Users
can explicitly save them to their account. They are not silently uploaded or
assigned to a principal whose ownership of historical browser data is unknown.
New server views are never written into the old unscoped local-storage cache.

## Storage and audit

`master.saved_view` stores versioned personal/shared configurations, including
creator and update actor. `master.principal_ui_preference` stores personal choices.
`master.saved_view_default` stores one tenant default per collection/surface using
an atomic upsert. All are governed by tenant RLS; a transaction-local shared-write
flag is issued only after server authorization. System view records are immutable.
The new default table uses `audit.trg_capture_row_change`, alongside the existing
saved-view and principal-preference audit capture. No parallel audit store is added.

Migration: `server/db/migrations/20260908_entity_saved_views.sql`; the canonical
bootstrap definition is `server/db/ddl/common/master/19_entity_saved_views.sql`.
Both register permissions without granting roles. Deploy the migration before
hosting a frontend that advertises server-backed entity views.

## Development rollout

Applied to local development Neon on 2026-09-08, with the API and Neon web images
rebuilt and healthy. Preferences, UI, relay and list tests passed, as did relevant
typechecks and database isolation/audit checks. The Manage route returns 200;
the unauthenticated views relay returns 401, confirming it passes the allowlist.
Authenticated browser interaction was not verified. Permissions are registered
but unassigned; IAM grants are required to expose shared-view publishing controls.

## Standard views and drawer sections

Manage views opens on **Available views**, grouped into Standard views, My views,
and Shared views. **Save current configuration** is a separate tab. Rename is an
inline action on the target row; it does not reuse the new-view name input.

Published `experience.standardViews` entries declare `key`, localized `label`,
`position`, `entityCode`, and `provider`. Ownership requires an explicit
`ownerField`. Related request collections remain navigation sections; generic
collections can omit navigation and use standard views directly. Every view stays
within the current collection and its existing authorization and organization scope.

The built-in relationship adapters are selected by published `providerKey`:

- `document.case_requests.v1` (`request_documents`): only the registered
  `document.entity_case` collection. `requestBinding` declares `sourceRef: entity_case`,
  optional `operationCodes`, an explicit snapshot role field and values, and/or
  `requester: initiator_or_submitter`. My requests uses accepted initial-draft
  (`before_version = 0`) or submission command evidence for the current actor.
  Later edits alone do not establish that relationship. It does not infer ownership
  from the Business Partner master's Created by field.
- `workflow.actionable_documents.v1` (`approval_tasks`): `approvalBinding` declares
  the task's `sourceEntityCode`, `workTypeCodes`, `workflowKeys`, `permissionCode`,
  and link strategy (`workflow_request` or `work_item_revision`). The source code
  can differ from the list entity code. The workflow-request strategy also verifies
  tenant, source identity, approval workflow type and pending request status.
  Task eligibility reuses the workflow repository's principal/team/candidate
  predicate, excludes future/closed tasks and tasks claimed by somebody else.
  Actions still perform their own current policy and workflow checks.

These adapters produce trusted server-side relationship predicates, never ID pages.
SQL EXISTS predicates run before pagination, sorting, grouping and exact counts,
so multiple tasks for a document do not duplicate rows and there is no 100-document
approval cap. Every relationship correlates tenant and record identity. Cursor
fingerprints include the resolved actor and relationship binding. HTTP clients
can send only the symbolic view key, not relationship predicates or actor IDs.

Recently-viewed identity sources remain optional and bounded to a complete maximum
of 100 identities. Missing sources are hidden; unavailable selections fail closed.
No recently-viewed source is enabled by this rollout.

Saved states and portable links persist `standardViewKey`, never resolved actor
IDs. The catalog exposes immutable `standard.<key>` choices, which can be personal
or tenant defaults. Standard-view transfer/export remains unavailable until transfer
execution supports the same symbolic query contract.

Business Partner master ownership remains unconfigured. Its Requests collection
publishes My requests, Awaiting my approval (permission-gated), Supplier requests,
Customer requests, Supplier extensions, Customer extensions, and Organization &
company extensions. Workforce requests use a different current document collection;
they are not silently mixed into Business Partner cases. The binding file is
`server/db/scripts/provisioning/config/business-partner-request-standard-views.json`.
The local publication script creates a new release, supports `--rehearse`, verifies
artifact hashes and refuses to apply a plan if its prior activation head changed.

Verification: set `ENTITY_VIEW_POSTGRES_TEST=1` for
`standard-views.postgres.test.ts`. It creates and drops an isolated database in the
local dev PostgreSQL container, verifies pagination and counts over 137 matching
documents, duplicate tasks, tenant/actor isolation, ineligible tasks, grouping,
request participation, and cursor binding. It never modifies application records.

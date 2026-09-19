# Business Partner Studio read-only workbench — Stage 2

Date: 2026-09-16

## Delivered

- A shared configuration header on Business Partner routes. The `inspect` URL parameter carries `release:<uuid>`, `draft:<uuid>`, or `bundle:<uuid>` across the module navigation and page refreshes.
- Explicit version selection; no automatic substitution of a sample, latest draft, or unrelated bundle.
- Native published-release inspection reads `snapshot.entity_contract_revision` through the exact `metadata.entity_release.revision_id`, checks tenant/entity coordinates, and verifies the stored contract hash.
- Model, validation, matching, and workflow tabs display the selected stored content. Overview counts and operation permission/scope tracing are derived from that same response.
- Known Business Partner bundle revisions can be inspected separately for request schemas, validation declarations, duplicate rules, and operational workflows.
- Existing publication, operations proof, and Atlas editors remain available. Their independent source/version ownership is identified next to the inspection view.
- Loading, denied, not-found, empty, unavailable, and invalid selection states. Old request responses cannot replace a newer selection.
- GET-only inspector: no grants, draft writes, publication, activation, or business-data changes.

## Usage

1. Open `/mdg/business-partner/model` in Studio.
2. Select a published source release in **Stored version**. Published source releases and change sets are separate optgroups.
3. Navigate with the Business Partner tab bar. The same `inspect` value remains in the URL.
4. Open field/relationship/surface details, validation declarations, or Operations & Proof to inspect source operation bindings.
5. For bundle-specific matching/workflow declarations, expand **Inspect a Business Partner bundle revision** and enter its known revision UUID. Switching to a bundle changes the source for every inspection tab; it does not silently merge definitions.
6. Use **Refresh stored data** to reread the selected source and catalog.

A native graph's published change-set status is not presented as an immutable release snapshot. To inspect exact released content, select a published source release.

## New read APIs

- `GET /api/meta-entity-authoring/inspection/releases`
- `GET /api/meta-entity-authoring/inspection/releases/:id`

Both use existing `metadata.entity.author` authorization, exact authenticated tenant scope, and `Cache-Control: private, no-store`. List is limited to 100 Business Partner releases ordered by release number. The existing change-set catalog is also limited to 100 recent entries. Unknown/out-of-tenant release IDs return 404 after authorization. The Studio relay explicitly allows only GET for the new paths. No DDL migration is required.

## Deliberate limits

- Target activation is **unverified**. A published source release is not proof that Neon or Mesh has activated it. This implementation does not invent cross-plane reads or bypass target authorization.
- Bundle revision discovery still requires a known ID. There is no inferred relationship between an independently loaded bundle and a native release.
- Policy contents outside the selected graph, matching execution results, and individual-user effective access are not fetched. Missing content is labeled.
- Supporting-document API dependencies are explicitly marked as source-code knowledge, not release-snapshot evidence.
- Existing authoring tools below the inspector maintain their own selection. Inspecting a source does not automatically select it for mutation.
- The workbench has been validated against source and automated fixtures. It has not been deployed or browser-qualified against the authenticated development environment in this task. Both Studio and the platform-host API need the updated code for release browsing.

## Validation

- Five workbench component/model tests: exact selected data and GET-only reads; tab content source consistency; stale read protection; denied-read clearing; wrong ID/entity rejection; plane-specific scope tracing.
- Five backend tests across release inspection routes, release repository, and existing graph editor routes: permission denial, tenant isolation, immutable snapshot selection, hash mismatch, and graph revision conflict.
- Six existing relay/navigation contract tests passed.
- Studio app, Studio Business Partner package, and native authoring package typechecks passed during implementation; final checks recorded in the task response.

## Next work

Qualify the read-only UI in the deployed development environment with an authorized Studio account, then add supported editing and differences as Stage 3. Target-active discovery remains a separate integration gap from the source-snapshot inspection delivered here.

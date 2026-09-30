# Entity record route cleanup

The Neon record entry is now `/app/entity/business_partner/<recordId>`.
The existing entity catch-all owns records and application views such as `manage`;
no competing dynamic route was added.

## Ownership

- `apps/neon/lib/entity-route-context.ts`: entity/UUID validation, catalog ownership
  and authorization-path compatibility mapping.
- `apps/neon/lib/entity-record-adapters.tsx`: shared page mounting.
- `packages/planes/neon/entity-extensions/src/registry.ts`: typed adapter registry.
- `entity-extensions/src/business-partner/adapter.tsx`: domain operation bindings.
- `entity-extensions/src/business-partner/clients/`: relocated clients and legacy
  panel compatibility contracts still used by remaining BP workflows.

The old BP detail URL redirects with query values preserved. List record links
target the generic route. Role, scope and request actions retain their existing
workflow routes. The BP record-runtime wrapper and its barrel export were removed.
The original client files were relocated and imports updated, not duplicated.

Shell and destination headers map only registered record URLs to existing catalog
authorization paths. Catalog entitlements and server resource authorization remain
in effect. Unknown entities and invalid IDs are not admitted as record routes.

The BP package/layout remain for other workflows. Legacy panel retirement and
remaining workflow migration are separate work. No database reset, metadata
publication or permission changes are part of this cleanup.

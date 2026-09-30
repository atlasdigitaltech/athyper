# Authorization catalog

`catalog.v2.json` is the only permission publication source for each plane.
Every permission is an exact `{plane}.{domain}.{entity}.{operation}` coordinate
with a deterministic UUID derived from the complete code. Short names,
unprefixed names, aliases, generic `action.*` identities, and migration
inventories are rejected.

The sole shared-capability exception is `common.platform.reference.view`.
`common` is a permission namespace, not a runtime plane. Its catalog product is
`common`, while the enclosing catalog and every grant remain Studio, Neon or Mesh.
It has kind `capability`, low risk, and only tenant/exact scope. Unknown `common.*`
codes are rejected. The same deterministic permission ID is installed separately
in each plane; neither identity nor namespace transfers a grant between planes.

Binding this capability requires an explicitly enrolled, published system reference
graph: `shared` table storage, generic reads, no writes, public stored read-only
fields, and only list/read/view operations. Country is the initial consumer. There
is no schema-wide grant, implicit enrollment, or write/import/export authority.

The catalogs are authored review artifacts. The build command normalizes only
ordering and checksums; it does not infer business permissions:

```powershell
pnpm run db:seed:authorization:catalog-v2:build
pnpm run db:seed:authorization:catalog-v2:check
```

An entity lifecycle operation becomes enforceable only after Studio publishes
one exact permission and all required scope coordinates through the metadata
release compiler. An unbound operation denies. Application demand, catalog
publication, operation binding, scope compatibility, and reviewed role grants
must all agree before access is enabled.

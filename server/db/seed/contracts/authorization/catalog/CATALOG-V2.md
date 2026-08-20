# Authorization catalog

`catalog.v2.json` is the only permission publication source for each plane.
Every permission is an exact `{plane}.{domain}.{entity}.{operation}` coordinate
with a deterministic UUID derived from the complete code. Short names,
unprefixed names, aliases, generic `action.*` identities, and migration
inventories are rejected.

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

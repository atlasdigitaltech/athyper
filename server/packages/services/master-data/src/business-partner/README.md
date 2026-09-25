# Business Partner domain capabilities

This directory owns Business Partner domain reads, policies, workflows and
integrations. It is not a UI folder.

- `record/` provides authorized header and section read models for the generic
  entity runtime.
- `banking/` owns bank facts and protected-value retrieval. Metadata may declare
  presentation and an operation key; it cannot bypass the tenant, permission,
  audit or secret-store checks implemented here.
- `classification/`, `relationships/` and `workflow/` own their domain rules.
- `integrations/` owns service-to-service MESH transport.
- `legacy-360/` is compatibility-only. It may be removed only after all clients
  use generic entity-runtime resources.

MetaEntity declares section shape, renderer, field bindings, lookup catalogs,
visibility, permissions and registered handler keys. This directory implements
the admitted handlers and remains the server-side authorization boundary.

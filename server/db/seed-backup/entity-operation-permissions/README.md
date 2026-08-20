# P5-E2 consumer permission catalogs

These are independent, opt-in seeds for the canonical plane-local `authz`
catalog. They deliberately are not part of the DDL manifests: `control.module`
reference data must exist first, and authority assignments remain a later,
separate operation.

Apply `000_module_coordinates.sql` first. It verifies the canonical `REL` and
`INT` module coordinates installed by the plane catalog seed; it does not
create or copy catalog rows.

- `neon/010_business_partner_permissions.sql` uses the active `REL` module.
- `mesh/010_document_envelope_permissions.sql` uses the active `INT` module.

The seeds create exact permission definitions plus scope policies. They do not
create roles, grants, group membership, scope targets, activation rules, or
`authz.entity_operation_scope_binding` rows.

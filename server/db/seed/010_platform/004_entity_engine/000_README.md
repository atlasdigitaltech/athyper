# Entity Engine Registry Seed — v1.2

Seeds all 111 `master.*` tables into the entity engine control tables.

## Execution order

```
010_system/entity_engine/
  002_field_groups.sql                     Phase 0 — 11 UI section groups
  010_lifecycles/001–021_lc_*.sql         Phase 1 — 21 lifecycle state machines
  020_entities/001–016_master_*.sql       Phase 2 — 111 entity registrations
  025_entity_versions.sql                  Phase 3 — version 1 for all entities
  030_canonical_fields/
    000_canonical_dictionary.sql           Phase 4 — 15 cross-entity canonical fields
  040_field_group_members.sql              Phase 5 — canonical field → group bindings
  050_entity_lifecycles.sql               Phase 6 — ~55 entity → lifecycle bindings
  070_entity_relations.sql                Phase 7 — ~75 FK/join relation declarations

030_tenant/entity_engine/  (run after tenant exists)
  010_entity_policies.sql                  Per-tenant — 111 entity access/audit policies
  020_field_security_policies.sql          Per-tenant — PII/masking for sensitive fields
```

## Deferred / not yet seeded

- `035_version_fields/` — per-entity version-bound field seeds (~2,800 rows)
- `060_entity_operations.sql` — entity operation registrations (~650 rows)

These are populated at runtime via the entity-runtime overlay or future seed scripts.

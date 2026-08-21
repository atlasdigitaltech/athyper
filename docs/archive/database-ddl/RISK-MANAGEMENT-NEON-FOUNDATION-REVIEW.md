# Risk Management — Neon Foundation Review

## Decision

Risk Management is Neon-owned.

- `master.risk_*` owns the shared risk taxonomy, model versions, and source
  registry.
- `master.party_risk_*` owns interpreted business-partner risk state,
  evidence, explainability, mitigations, and the review audit trail.
- `control.risk_source_config` owns tenant enablement and risk-specific source
  policy; connector instances own transport and secret references.
- `governance` continues to own governance workflow infrastructure such as
  close cycles, certifications, legal holds, moderation, and report packs.
- Platform/Admin and Mesh must not create copies of these risk tables.

Admin is a management surface over Neon APIs and authorization. It is not a
separate persistence owner.

## Active Neon catalog inspection

The configured active `athyper_neon` database was inspected read-only on
2026-07-31.

The exact requested risk flow already exists in `master`; no matching risk
tables or cross-schema risk foreign keys exist in `governance`.

| Existing Neon object | Rows |
|---|---:|
| `risk_dimension` | 8 |
| `risk_driver_registry` | 23 |
| `risk_model` | 4 |
| `risk_model_dimension` | 22 |
| `risk_source` | 8 |
| `party_risk_assessment` | 29 |
| `party_risk_dimension_score` | 174 |
| `party_risk_driver` | 82 |
| `party_risk_evidence` | 73 |
| `party_risk_mitigation` | 41 |
| `party_risk_review_event` | 88 |
| `tenant_risk_source_config` | 24 |

The live `governance` schema contains 17 tables. They cover close-cycle,
legal-hold, moderation, preserved-identity, and report-pack concerns and do
not overlap the party-risk model.

## Foundation changes

The Neon desired-state manifest now extracts the established live contract
instead of creating a second model:

1. reference catalogs and versioned scoring models;
2. party subject binding for business partners, suppliers, and customers;
3. approved assessment immutability and explicit overrides;
4. per-dimension explainability and driver/evidence consistency;
5. append-oriented evidence with immutable provider payloads;
6. mitigation ownership and assessment/driver consistency;
7. append-only review events;
8. forced tenant RLS on all tenant-scoped risk tables;
9. tenant source policy in `control`, linked to the unified connector model;
10. Neon-only guards on the existing risk seeds.

## Live migration requirements

Do not execute the fresh-database manifest against the active database.

For a live migration:

1. inventory all 12 existing tables and their constraints by signature;
2. create tenant connector instances/endpoints for provider transport settings;
3. inspect legacy `api_config` and move endpoint/authentication settings into
   the connector model;
4. retain only risk-specific policy in `control.risk_source_config.risk_settings`;
5. remap the legacy nil creator to a tenant-local migration principal;
6. reconcile constraint and trigger differences using `NOT VALID` foreign
   keys where an online rollout requires it;
7. validate tenant isolation and row counts before switching services;
8. regenerate the Neon ORM contract from the migrated database;
9. verify Platform and Mesh contain no physical risk tables.

No live database mutation was performed during this review.

# Business Partner domain-value inventory

Status: Step 1 implementation inventory, 2026-08-29. Normative design: [Athyper Business Partner architecture design](./athyper-business-partner-architecture-design.md).

## Inventory result

| Axis | Values accepted before hardening | Sealed values | Compatibility action |
|---|---|---|---|
| BP category | `organization`, `individual`, `government`, `nonprofit`, `internal` | `organization`, `person`, `group` | map legacy values before adding the domain constraint |
| BP ownership | encoded as category `internal` | `external`, `internal` | move to `ownership_class` |
| Legal classification | encoded as category `government`/`nonprofit` | `government`, `nonprofit`, `sole_proprietor` | retain in `legal_classification` |
| BP status | unconstrained text domain | `draft`, `active`, `inactive`, `archived` | fail on every unknown value |
| Supplier status | unconstrained text domain | `onboarding`, `active`, `suspended`, `inactive`, `archived` | fail on every unknown value |
| Customer status | unconstrained text domain | `prospect`, `active`, `suspended`, `inactive`, `archived` | fail on every unknown value |
| Commercial role | `supplier`, `customer` | unchanged | workforce remains outside `master.partner_role_d` |

The active runtime consumers were the Business Partner request materializer, governed import adapter, supplier onboarding form, commercial-role guard, legal-entity self-link guard, and aggregate search view. Backup-only demo seeds still contain legacy literals and must be normalized before any restoration into a hardened database.

## Migration policy

`20260829_neon_business_partner_domain_hardening.sql` inventories live rows inside the transaction and raises before mutation when it finds an unmapped value. Known values are normalized, constraints are added `NOT VALID`, and then validated. This makes the migration fail closed and leaves no interval in which an unexpected value is silently coerced.

The person coordinate is intentionally staged for upgraded databases:

- new writes must provide `master.person.business_partner_id` because a `NOT VALID` required check still applies to new rows;
- legacy null rows remain readable until a steward-approved identity match/backfill is loaded;
- the tenant-safe foreign key is validated immediately and uniqueness applies to every non-null link;
- a later cutover validates the required check and changes the column to `NOT NULL`.

Fresh canonical DDL creates `business_partner_id` as `NOT NULL`. No migration fabricates or guesses a person-to-BP match.

## Production preflight evidence

Before applying the cutover migration, capture counts grouped by `partner_category` and status for `master.business_partner`, `master.supplier`, and `master.customer`, plus the count of unlinked `master.person` rows. The migration repeats the unknown-value checks under its transaction; deployment evidence should retain both the preflight output and the migration result.

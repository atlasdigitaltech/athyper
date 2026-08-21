# Lookup System

The lookup system provides a two-level hierarchy for all named code/label sets in Athyper. `control.lookup_domain` is the registry of domains; `control.lookup_value` holds the code+label pairs within each domain.

---

## `control.lookup_domain`

One row per named lookup set. Domains are platform-global (`ARCHETYPE=B;SCOPE=N`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | Format: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$` (dot-namespaced) |
| `name` | `text NOT NULL` | Human-readable label; `btrim(name) <> ''` enforced |
| `description` | `text` | Optional narrative description |
| `source_schema` | `text NOT NULL` | Which DB schema owns this domain |
| `is_extensible` | `bool NOT NULL DEFAULT false` | `true` = tenants may add their own values |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Open extension bag |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` |
| `is_active` | `bool GENERATED` | `GENERATED ALWAYS AS (status = 'active')` |
| `status_changed_at` | `timestamptz` | |
| `status_changed_by` | `uuid` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(code)`

---

## `control.lookup_value`

One row per code+label pair within a domain. Global rows are `tenant_id IS NULL, is_system = true`. Tenant extensions are `tenant_id IS NOT NULL, is_system = false`. (`ARCHETYPE=B;SCOPE=G`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = global platform value |
| `code` | `text NOT NULL` | Format: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$` |
| `name` | `text NOT NULL` | Human-readable label |
| `domain_code` | `text NOT NULL` | FK → `control.lookup_domain.code` |
| `description` | `text` | |
| `category` | `text` | Optional grouping within the domain |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | Display order |
| `is_system` | `bool NOT NULL DEFAULT true` | `true` = platform-seeded; `false` = tenant extension |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `deprecated` |
| `is_active` | `bool GENERATED` | |
| `status_changed_at` / `status_changed_by` | `timestamptz` / `uuid` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Consistency CHECK:**
```sql
(is_system = true  AND tenant_id IS NULL)
OR (is_system = false AND tenant_id IS NOT NULL)
```

---

## Domain Code Conventions

Domain codes use dot-namespaced snake_case: `<module>.<concept>`. Examples:

| Domain Code | Description |
|---|---|
| `notification.channel` | Supported notification channels (email, sms, push, in_app, whatsapp) |
| `notification.priority` | Notification priority levels (low, normal, high, urgent) |
| `lifecycle.status` | Standard lifecycle state labels |
| `finance.tax_type` | Tax type classification codes |
| `payment.network` | Payment rail codes (SEPA, SWIFT, ACH, NEFT, etc.) |

---

## Usage Pattern

**Seeding a new domain:**
```sql
INSERT INTO control.lookup_domain (code, name, source_schema, is_extensible, created_by)
VALUES ('notification.channel', 'Notification Channels', 'control', true, <system_uuid>);

INSERT INTO control.lookup_value (code, name, domain_code, sort_order, created_by)
VALUES ('email', 'Email', 'notification.channel', 1, <system_uuid>),
       ('sms', 'SMS', 'notification.channel', 2, <system_uuid>);
```

**Tenant extension (is_extensible = true domains only):**
```sql
INSERT INTO control.lookup_value (tenant_id, code, name, domain_code, is_system, created_by)
VALUES (<tenant_id>, 'whatsapp', 'WhatsApp', 'notification.channel', false, <principal_id>);
```

**Validation trigger:**  
`control.trg_validate_lookup_columns` runs on INSERT/UPDATE of tables with lookup-validated text columns. For sealed domains (`is_extensible = false`), inserts are blocked if the value is not present in `control.lookup_value`.

---

## Runtime Lookup Query

```typescript
// GET /api/lookup/:domainCode
// Returns: { code, name, description, sort_order }[]
// Sorted by sort_order ASC, code ASC
// Filtered to is_active = true, and includes:
//   - global values (tenant_id IS NULL)
//   - calling tenant's extension values (tenant_id = caller.tenantId)
```

---

## Related Docs

- [Overview](./overview.md)
- [Notifications](./notifications.md)
- [Dimension, Tax & Rounding](./dimension-tax-rounding.md)

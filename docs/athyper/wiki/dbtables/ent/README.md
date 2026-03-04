# ent Schema -- Enterprise Master Data & Classification

**Source DDL**: `framework/adapters/db/src/sql/070_ent.sql`, `framework/adapters/db/src/sql/071_ent_classification.sql`
**PostgreSQL**: 16+

The `ent` schema holds enterprise master data -- the core business entities (customers, suppliers, employees, products) that transactional modules reference. All master data tables are tenant-scoped via a mandatory `tenant_id` foreign key to `core.tenant`. The schema also includes classification infrastructure (crosswalks, AI suggestions, feedback loops) that bridges internal product categories to international commodity and industry standards.

---

## Table of Contents

### Master Data (070_ent.sql)

1. [ent.customer](#entcustomer)
2. [ent.supplier](#entsupplier)
3. [ent.employee](#entemployee)
4. [ent.product_category](#entproduct_category)
5. [ent.product](#entproduct)
6. [ent.entity_relationship](#ententity_relationship)

### Classification Infrastructure (071_ent_classification.sql)

7. [ent.commodity_crosswalk](#entcommodity_crosswalk)
8. [ent.industry_crosswalk](#entindustry_crosswalk)
9. [ent.category_commodity_map](#entcategory_commodity_map)
10. [ent.classification_config](#entclassification_config)
11. [ent.classification_suggestion](#entclassification_suggestion)
12. [ent.classification_feedback](#entclassification_feedback)

---

## ent.customer

### Functional Description

Master customer records representing the organizations and individuals that the tenant does business with. Each customer has a tenant-unique code, a classification type (individual, business, government, nonprofit), and optional linkage to an industry classification code from the `ref` schema. Customers participate in downstream transactional entities such as sales orders and invoices.

### Technical Details

| Column               | Type        | Nullable | Default             | Description                                                          |
| -------------------- | ----------- | -------- | ------------------- | -------------------------------------------------------------------- |
| id                   | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                               |
| tenant_id            | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                  |
| code                 | text        | NOT NULL | --                  | Tenant-unique customer code (e.g. `CUST-001`).                       |
| name                 | text        | NOT NULL | --                  | Legal or registered customer name.                                   |
| display_name         | text        | YES      | --                  | Friendly display name.                                               |
| customer_type        | text        | NOT NULL | `'individual'`      | Classification: `individual`, `business`, `government`, `nonprofit`. |
| status               | text        | NOT NULL | `'active'`          | Lifecycle status.                                                    |
| tax_id               | text        | YES      | --                  | Tax identification number.                                           |
| industry_code        | text        | YES      | --                  | Industry classification code (qualified by `industry_domain_code`).  |
| industry_domain_code | text        | YES      | --                  | Industry domain qualifier (e.g. `isic`, `naics`).                    |
| primary_contact_id   | uuid        | YES      | --                  | Reference to primary contact (future FK).                            |
| primary_address_id   | uuid        | YES      | --                  | Reference to primary address (future FK).                            |
| metadata             | jsonb       | YES      | --                  | Extensible metadata.                                                 |
| tags                 | text[]      | YES      | --                  | Searchable tag array.                                                |
| created_at           | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                              |
| created_by           | text        | NOT NULL | --                  | Identity that created the row.                                       |
| updated_at           | timestamptz | YES      | --                  | Last update timestamp.                                               |
| updated_by           | text        | YES      | --                  | Identity that last updated the row.                                  |

### Primary Key

`id` (uuid)

### Unique Constraints

- `customer_tenant_code_uniq`: `(tenant_id, code)`

### Check Constraints

- `customer_type_chk`: `customer_type IN ('individual', 'business', 'government', 'nonprofit')`
- `customer_status_chk`: `status IN ('active', 'inactive', 'suspended', 'archived')`

### Foreign Keys

| FK Name / Column(s)                                         | References                           | On Delete             |
| ----------------------------------------------------------- | ------------------------------------ | --------------------- |
| tenant_id                                                   | core.tenant(id)                      | CASCADE               |
| fk_customer_industry: (industry_domain_code, industry_code) | ref.industry_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name            | Columns                               | Notes                                        |
| --------------------- | ------------------------------------- | -------------------------------------------- |
| idx_customer_tenant   | tenant_id                             | Tenant partition scan.                       |
| idx_customer_status   | (tenant_id, status)                   | Filter customers by status within a tenant.  |
| idx_customer_name     | (tenant_id, name)                     | Name lookup within a tenant.                 |
| idx_customer_tags     | tags (GIN)                            | Array containment / overlap queries on tags. |
| idx_customer_industry | (industry_domain_code, industry_code) | Industry classification lookup.              |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Reference**: `ref.industry_code` via `(industry_domain_code, industry_code)`
- **Referenced by**: `ent.entity_relationship` (polymorphic, via `entity_a_type/entity_b_type = 'customer'`)

---

## ent.supplier

### Functional Description

Master supplier/vendor records for organizations that provide goods or services to the tenant. Suppliers carry classification by type (vendor, contractor, distributor, manufacturer) and optional linkage to industry codes. Payment terms and preferred currency are stored to support procurement and accounts payable workflows.

### Technical Details

| Column               | Type        | Nullable | Default             | Description                                                            |
| -------------------- | ----------- | -------- | ------------------- | ---------------------------------------------------------------------- |
| id                   | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                 |
| tenant_id            | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                    |
| code                 | text        | NOT NULL | --                  | Tenant-unique supplier code.                                           |
| name                 | text        | NOT NULL | --                  | Legal or registered supplier name.                                     |
| display_name         | text        | YES      | --                  | Friendly display name.                                                 |
| supplier_type        | text        | NOT NULL | `'vendor'`          | Classification: `vendor`, `contractor`, `distributor`, `manufacturer`. |
| status               | text        | NOT NULL | `'active'`          | Lifecycle status.                                                      |
| tax_id               | text        | YES      | --                  | Tax identification number.                                             |
| industry_code        | text        | YES      | --                  | Industry classification code (qualified by `industry_domain_code`).    |
| industry_domain_code | text        | YES      | --                  | Industry domain qualifier (e.g. `isic`, `naics`).                      |
| primary_contact_id   | uuid        | YES      | --                  | Reference to primary contact (future FK).                              |
| primary_address_id   | uuid        | YES      | --                  | Reference to primary address (future FK).                              |
| payment_terms        | text        | YES      | --                  | Payment terms (e.g. `NET30`, `NET60`).                                 |
| currency_code        | text        | YES      | --                  | Preferred payment currency (ISO 4217).                                 |
| metadata             | jsonb       | YES      | --                  | Extensible metadata.                                                   |
| tags                 | text[]      | YES      | --                  | Searchable tag array.                                                  |
| created_at           | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                                |
| created_by           | text        | NOT NULL | --                  | Identity that created the row.                                         |
| updated_at           | timestamptz | YES      | --                  | Last update timestamp.                                                 |
| updated_by           | text        | YES      | --                  | Identity that last updated the row.                                    |

### Primary Key

`id` (uuid)

### Unique Constraints

- `supplier_tenant_code_uniq`: `(tenant_id, code)`

### Check Constraints

- `supplier_type_chk`: `supplier_type IN ('vendor', 'contractor', 'distributor', 'manufacturer')`
- `supplier_status_chk`: `status IN ('active', 'inactive', 'suspended', 'archived')`

### Foreign Keys

| FK Name / Column(s)                                         | References                           | On Delete             |
| ----------------------------------------------------------- | ------------------------------------ | --------------------- |
| tenant_id                                                   | core.tenant(id)                      | CASCADE               |
| fk_supplier_industry: (industry_domain_code, industry_code) | ref.industry_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name            | Columns                               | Notes                                       |
| --------------------- | ------------------------------------- | ------------------------------------------- |
| idx_supplier_tenant   | tenant_id                             | Tenant partition scan.                      |
| idx_supplier_status   | (tenant_id, status)                   | Filter suppliers by status within a tenant. |
| idx_supplier_name     | (tenant_id, name)                     | Name lookup within a tenant.                |
| idx_supplier_industry | (industry_domain_code, industry_code) | Industry classification lookup.             |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Reference**: `ref.industry_code` via `(industry_domain_code, industry_code)`
- **Referenced by**: `ent.entity_relationship` (polymorphic, via `entity_a_type/entity_b_type = 'supplier'`)

---

## ent.employee

### Functional Description

Master employee records linking human resources data with the platform's identity model. Each employee belongs to a tenant, may be linked to a `core.principal` for authentication, and sits within an organizational hierarchy via the self-referencing `manager_id` column. The table supports workforce classification (full-time, part-time, contractor, intern, temporary) and organizational placement through department and organizational unit references.

### Technical Details

| Column           | Type        | Nullable | Default             | Description                                                           |
| ---------------- | ----------- | -------- | ------------------- | --------------------------------------------------------------------- |
| id               | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                |
| tenant_id        | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                   |
| principal_id     | uuid        | YES      | --                  | Linked security principal for authentication. FK to `core.principal`. |
| employee_number  | text        | NOT NULL | --                  | Tenant-unique employee identifier.                                    |
| first_name       | text        | NOT NULL | --                  | Legal first name.                                                     |
| last_name        | text        | NOT NULL | --                  | Legal last name.                                                      |
| display_name     | text        | YES      | --                  | Preferred display name.                                               |
| email            | text        | YES      | --                  | Work email address.                                                   |
| phone            | text        | YES      | --                  | Work phone number.                                                    |
| status           | text        | NOT NULL | `'active'`          | Lifecycle status.                                                     |
| employment_type  | text        | NOT NULL | `'full_time'`       | Employment classification.                                            |
| department       | text        | YES      | --                  | Department name (denormalized).                                       |
| title            | text        | YES      | --                  | Job title.                                                            |
| manager_id       | uuid        | YES      | --                  | Direct manager. Self-referencing FK to `ent.employee`.                |
| ou_id            | uuid        | YES      | --                  | Organizational unit. FK to `core.organizational_unit`.                |
| hire_date        | date        | YES      | --                  | Date of hire.                                                         |
| termination_date | date        | YES      | --                  | Date of termination (NULL if still employed).                         |
| metadata         | jsonb       | YES      | --                  | Extensible metadata.                                                  |
| tags             | text[]      | YES      | --                  | Searchable tag array.                                                 |
| created_at       | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                               |
| created_by       | text        | NOT NULL | --                  | Identity that created the row.                                        |
| updated_at       | timestamptz | YES      | --                  | Last update timestamp.                                                |
| updated_by       | text        | YES      | --                  | Identity that last updated the row.                                   |

### Primary Key

`id` (uuid)

### Unique Constraints

- `employee_tenant_number_uniq`: `(tenant_id, employee_number)`

### Check Constraints

- `employee_status_chk`: `status IN ('active', 'inactive', 'on_leave', 'terminated')`
- `employee_type_chk`: `employment_type IN ('full_time', 'part_time', 'contractor', 'intern', 'temporary')`

### Foreign Keys

| FK Column    | References                   | On Delete |
| ------------ | ---------------------------- | --------- |
| tenant_id    | core.tenant(id)              | CASCADE   |
| principal_id | core.principal(id)           | SET NULL  |
| manager_id   | ent.employee(id)             | SET NULL  |
| ou_id        | core.organizational_unit(id) | SET NULL  |

### Indexes

| Index Name              | Columns                 | Notes                                       |
| ----------------------- | ----------------------- | ------------------------------------------- |
| idx_employee_tenant     | tenant_id               | Tenant partition scan.                      |
| idx_employee_principal  | principal_id            | Look up employee by security principal.     |
| idx_employee_status     | (tenant_id, status)     | Filter employees by status within a tenant. |
| idx_employee_manager    | manager_id              | Manager hierarchy traversal.                |
| idx_employee_department | (tenant_id, department) | Filter employees by department.             |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **References**: `core.principal` via `principal_id`, `core.organizational_unit` via `ou_id`
- **Self-referencing**: `manager_id` for reporting hierarchy
- **Referenced by**: `ent.entity_relationship` (polymorphic)

---

## ent.product_category

### Functional Description

Hierarchical product categories that organize a tenant's product catalog into a navigable tree. Each category can reference a parent category to form an arbitrarily deep hierarchy, and carries an optional mapping to a standard commodity classification code from the `ref` schema. The `sort_order` column controls display ordering among siblings. Categories bridge the gap between a tenant's internal taxonomy and international commodity standards.

### Technical Details

| Column                | Type        | Nullable | Default             | Description                                                              |
| --------------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------------ |
| id                    | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                   |
| tenant_id             | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                      |
| code                  | text        | NOT NULL | --                  | Tenant-unique category code.                                             |
| name                  | text        | NOT NULL | --                  | Category display name.                                                   |
| description           | text        | YES      | --                  | Category description.                                                    |
| parent_id             | uuid        | YES      | --                  | Parent category for hierarchy. Self-referencing FK.                      |
| sort_order            | int         | YES      | --                  | Display sort order among siblings.                                       |
| is_active             | boolean     | NOT NULL | `true`              | Whether this category is active.                                         |
| commodity_domain_code | text        | YES      | --                  | Primary commodity standard this category maps to (e.g. `unspsc`).        |
| commodity_code        | text        | YES      | --                  | Commodity code within the domain.                                        |
| commodity_level       | smallint    | YES      | --                  | Hierarchy level within the commodity domain (1=segment, 2=family, etc.). |
| metadata              | jsonb       | YES      | --                  | Extensible metadata.                                                     |
| created_at            | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                                  |
| created_by            | text        | NOT NULL | --                  | Identity that created the row.                                           |
| updated_at            | timestamptz | YES      | --                  | Last update timestamp.                                                   |
| updated_by            | text        | YES      | --                  | Identity that last updated the row.                                      |

### Primary Key

`id` (uuid)

### Unique Constraints

- `product_category_tenant_code_uniq`: `(tenant_id, code)`

### Foreign Keys

| FK Name / Column(s)                                                    | References                            | On Delete             |
| ---------------------------------------------------------------------- | ------------------------------------- | --------------------- |
| tenant_id                                                              | core.tenant(id)                       | CASCADE               |
| parent_id                                                              | ent.product_category(id)              | SET NULL              |
| fk_product_category_commodity: (commodity_domain_code, commodity_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name                  | Columns   | Notes                        |
| --------------------------- | --------- | ---------------------------- |
| idx_product_category_tenant | tenant_id | Tenant partition scan.       |
| idx_product_category_parent | parent_id | Hierarchical tree traversal. |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Self-referencing**: `parent_id` for category hierarchy
- **Reference**: `ref.commodity_code` via `(commodity_domain_code, commodity_code)`
- **Referenced by**: `ent.product.category_id`, `ent.category_commodity_map.category_id`

---

## ent.product

### Functional Description

Master product records for goods, services, subscriptions, and bundles offered or procured by the tenant. Each product belongs to a category, carries pricing metadata (base price, currency, unit of measure), tax classification, and optional commodity classification for procurement and trade compliance. The `sku` column provides an additional unique product identifier commonly used in warehouse and inventory systems.

### Technical Details

| Column                | Type          | Nullable | Default             | Description                                            |
| --------------------- | ------------- | -------- | ------------------- | ------------------------------------------------------ |
| id                    | uuid          | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                 |
| tenant_id             | uuid          | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                    |
| code                  | text          | NOT NULL | --                  | Tenant-unique product code.                            |
| sku                   | text          | YES      | --                  | Stock-keeping unit identifier.                         |
| name                  | text          | NOT NULL | --                  | Product display name.                                  |
| description           | text          | YES      | --                  | Product description.                                   |
| category_id           | uuid          | YES      | --                  | Product category. FK to `ent.product_category`.        |
| status                | text          | NOT NULL | `'active'`          | Lifecycle status.                                      |
| product_type          | text          | NOT NULL | `'physical'`        | Product classification.                                |
| unit_of_measure       | text          | YES      | --                  | Default UoM code (references `ref.uom` informally).    |
| base_price            | numeric(18,4) | YES      | --                  | Base price in the product's currency.                  |
| currency_code         | text          | YES      | --                  | Pricing currency (ISO 4217).                           |
| is_taxable            | boolean       | NOT NULL | `true`              | Whether the product is subject to tax.                 |
| tax_code              | text          | YES      | --                  | Tax category or rate code.                             |
| commodity_domain_code | text          | YES      | --                  | Commodity classification domain (e.g. `unspsc`, `hs`). |
| commodity_code        | text          | YES      | --                  | Commodity code within the domain.                      |
| metadata              | jsonb         | YES      | --                  | Extensible metadata.                                   |
| tags                  | text[]        | YES      | --                  | Searchable tag array.                                  |
| created_at            | timestamptz   | NOT NULL | `now()`             | Row creation timestamp.                                |
| created_by            | text          | NOT NULL | --                  | Identity that created the row.                         |
| updated_at            | timestamptz   | YES      | --                  | Last update timestamp.                                 |
| updated_by            | text          | YES      | --                  | Identity that last updated the row.                    |

### Primary Key

`id` (uuid)

### Unique Constraints

- `product_tenant_code_uniq`: `(tenant_id, code)`

### Check Constraints

- `product_status_chk`: `status IN ('active', 'inactive', 'discontinued', 'draft')`
- `product_type_chk`: `product_type IN ('physical', 'digital', 'service', 'subscription', 'bundle')`

### Foreign Keys

| FK Name / Column(s)                                           | References                            | On Delete             |
| ------------------------------------------------------------- | ------------------------------------- | --------------------- |
| tenant_id                                                     | core.tenant(id)                       | CASCADE               |
| category_id                                                   | ent.product_category(id)              | SET NULL              |
| fk_product_commodity: (commodity_domain_code, commodity_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name            | Columns                                 | Notes                                        |
| --------------------- | --------------------------------------- | -------------------------------------------- |
| idx_product_tenant    | tenant_id                               | Tenant partition scan.                       |
| idx_product_status    | (tenant_id, status)                     | Filter products by status within a tenant.   |
| idx_product_category  | category_id                             | Products in a given category.                |
| idx_product_sku       | (tenant_id, sku)                        | SKU lookup within a tenant.                  |
| idx_product_tags      | tags (GIN)                              | Array containment / overlap queries on tags. |
| idx_product_commodity | (commodity_domain_code, commodity_code) | Commodity classification lookup.             |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **References**: `ent.product_category` via `category_id`, `ref.commodity_code` via `(commodity_domain_code, commodity_code)`
- **Referenced by**: `ent.entity_relationship` (polymorphic)

---

## ent.entity_relationship

### Functional Description

A generic, polymorphic association table that links any two entities within a tenant. Rather than creating dedicated join tables for every possible entity combination (customer-to-supplier, product-to-product, etc.), this table uses type/id pairs for both sides of the relationship. Relationships carry a type label, bidirectionality flag, temporal validity window, and lifecycle status. This enables flexible graph-like queries over the enterprise data model.

### Technical Details

| Column            | Type        | Nullable | Default             | Description                                                       |
| ----------------- | ----------- | -------- | ------------------- | ----------------------------------------------------------------- |
| id                | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                            |
| tenant_id         | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                               |
| relationship_type | text        | NOT NULL | --                  | Relationship label (e.g. `parent_company`, `preferred_supplier`). |
| entity_a_type     | text        | NOT NULL | --                  | Entity type of side A (e.g. `customer`, `product`).               |
| entity_a_id       | uuid        | NOT NULL | --                  | Row ID of side A entity.                                          |
| entity_b_type     | text        | NOT NULL | --                  | Entity type of side B.                                            |
| entity_b_id       | uuid        | NOT NULL | --                  | Row ID of side B entity.                                          |
| is_bidirectional  | boolean     | NOT NULL | `false`             | Whether the relationship applies in both directions.              |
| status            | text        | NOT NULL | `'active'`          | Lifecycle status.                                                 |
| effective_from    | timestamptz | YES      | --                  | Start of validity window.                                         |
| effective_until   | timestamptz | YES      | --                  | End of validity window (NULL = no expiry).                        |
| metadata          | jsonb       | YES      | --                  | Extensible metadata.                                              |
| created_at        | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                           |
| created_by        | text        | NOT NULL | --                  | Identity that created the row.                                    |
| updated_at        | timestamptz | YES      | --                  | Last update timestamp.                                            |
| updated_by        | text        | YES      | --                  | Identity that last updated the row.                               |

### Primary Key

`id` (uuid)

### Check Constraints

- `entity_relationship_status_chk`: `status IN ('active', 'inactive', 'archived')`

### Foreign Keys

| FK Column | References      | On Delete |
| --------- | --------------- | --------- |
| tenant_id | core.tenant(id) | CASCADE   |

Note: `entity_a_id` and `entity_b_id` are **not** database-level foreign keys -- they are polymorphic references resolved by application logic using the corresponding `_type` column.

### Indexes

| Index Name                   | Columns                                 | Notes                                       |
| ---------------------------- | --------------------------------------- | ------------------------------------------- |
| idx_entity_relationship_a    | (tenant_id, entity_a_type, entity_a_id) | Find all relationships from a given entity. |
| idx_entity_relationship_b    | (tenant_id, entity_b_type, entity_b_id) | Find all relationships to a given entity.   |
| idx_entity_relationship_type | (tenant_id, relationship_type)          | Filter by relationship type.                |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Polymorphic references**: Any entity via `(entity_a_type, entity_a_id)` and `(entity_b_type, entity_b_id)`

---

## ent.commodity_crosswalk

### Functional Description

Cross-domain commodity code mappings that serve as a "Rosetta Stone" between different commodity classification systems (e.g. UNSPSC to HS, HS to custom). Each mapping records the source and target domain/code pair, a SKOS-aligned mapping type (EXACT, BROAD, NARROW, PARTIAL, RELATED), a confidence score, and the provenance of the mapping (official standard, AI-generated, manually entered, etc.). Mappings can be independently verified by domain experts, creating an auditable knowledge base for procurement classification.

### Technical Details

| Column             | Type         | Nullable | Default             | Description                                                              |
| ------------------ | ------------ | -------- | ------------------- | ------------------------------------------------------------------------ |
| id                 | uuid         | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                   |
| source_domain_code | text         | NOT NULL | --                  | Source commodity domain. FK to `ref.commodity_domain`.                   |
| source_code        | text         | NOT NULL | --                  | Source commodity code.                                                   |
| target_domain_code | text         | NOT NULL | --                  | Target commodity domain. FK to `ref.commodity_domain`.                   |
| target_code        | text         | NOT NULL | --                  | Target commodity code.                                                   |
| mapping_type       | text         | NOT NULL | --                  | SKOS mapping relation: `EXACT`, `BROAD`, `NARROW`, `PARTIAL`, `RELATED`. |
| confidence         | decimal(5,2) | YES      | --                  | Confidence score (0.00 - 100.00).                                        |
| provenance         | text         | NOT NULL | `'MANUAL'`          | Origin of the mapping.                                                   |
| verified           | boolean      | NOT NULL | `false`             | Whether the mapping has been expert-verified.                            |
| verified_by        | text         | YES      | --                  | Identity that verified the mapping.                                      |
| verified_at        | timestamptz  | YES      | --                  | When the mapping was verified.                                           |
| notes              | text         | YES      | --                  | Free-text notes.                                                         |
| metadata           | jsonb        | NOT NULL | `'{}'::jsonb`       | Extensible metadata.                                                     |
| created_at         | timestamptz  | NOT NULL | `now()`             | Row creation timestamp.                                                  |
| created_by         | text         | NOT NULL | `'seed'`            | Identity that created the row.                                           |
| updated_at         | timestamptz  | YES      | --                  | Last update timestamp.                                                   |
| updated_by         | text         | YES      | --                  | Identity that last updated the row.                                      |

### Primary Key

`id` (uuid)

### Unique Constraints

- `uq_ent_commodity_xwalk`: `(source_domain_code, source_code, target_domain_code, target_code)`

### Check Constraints

- `mapping_type IN ('EXACT', 'BROAD', 'NARROW', 'PARTIAL', 'RELATED')`
- `confidence IS NULL OR (confidence >= 0 AND confidence <= 100)`
- `provenance IN ('OFFICIAL', 'AI_GENERATED', 'AI_VERIFIED', 'MANUAL', 'IMPORTED')`

### Foreign Keys

| FK Name / Column(s)                                              | References                            | On Delete             |
| ---------------------------------------------------------------- | ------------------------------------- | --------------------- |
| source_domain_code                                               | ref.commodity_domain(code)            | (default -- restrict) |
| target_domain_code                                               | ref.commodity_domain(code)            | (default -- restrict) |
| fk_ent_commodity_xwalk_source: (source_domain_code, source_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |
| fk_ent_commodity_xwalk_target: (target_domain_code, target_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name                | Columns                           | Notes                                                 |
| ------------------------- | --------------------------------- | ----------------------------------------------------- |
| idx_ent_cxwalk_source     | (source_domain_code, source_code) | Lookup mappings from a source code.                   |
| idx_ent_cxwalk_target     | (target_domain_code, target_code) | Reverse lookup by target code.                        |
| idx_ent_cxwalk_confidence | confidence WHERE verified = false | Unverified low-confidence mappings for review queues. |

### Relationships

- **References**: `ref.commodity_domain` (source and target), `ref.commodity_code` (source and target)

---

## ent.industry_crosswalk

### Functional Description

Cross-domain industry code mappings that translate between industry classification systems (e.g. ISIC to NAICS, NAICS to custom). Structurally identical to `ent.commodity_crosswalk` but operates on industry domains. Supports the same SKOS mapping types, confidence scoring, provenance tracking, and expert verification workflow.

### Technical Details

| Column             | Type         | Nullable | Default             | Description                                                              |
| ------------------ | ------------ | -------- | ------------------- | ------------------------------------------------------------------------ |
| id                 | uuid         | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                   |
| source_domain_code | text         | NOT NULL | --                  | Source industry domain. FK to `ref.industry_domain`.                     |
| source_code        | text         | NOT NULL | --                  | Source industry code.                                                    |
| target_domain_code | text         | NOT NULL | --                  | Target industry domain. FK to `ref.industry_domain`.                     |
| target_code        | text         | NOT NULL | --                  | Target industry code.                                                    |
| mapping_type       | text         | NOT NULL | --                  | SKOS mapping relation: `EXACT`, `BROAD`, `NARROW`, `PARTIAL`, `RELATED`. |
| confidence         | decimal(5,2) | YES      | --                  | Confidence score (0.00 - 100.00).                                        |
| provenance         | text         | NOT NULL | `'MANUAL'`          | Origin of the mapping.                                                   |
| verified           | boolean      | NOT NULL | `false`             | Whether the mapping has been expert-verified.                            |
| verified_by        | text         | YES      | --                  | Identity that verified the mapping.                                      |
| verified_at        | timestamptz  | YES      | --                  | When the mapping was verified.                                           |
| notes              | text         | YES      | --                  | Free-text notes.                                                         |
| metadata           | jsonb        | NOT NULL | `'{}'::jsonb`       | Extensible metadata.                                                     |
| created_at         | timestamptz  | NOT NULL | `now()`             | Row creation timestamp.                                                  |
| created_by         | text         | NOT NULL | `'seed'`            | Identity that created the row.                                           |
| updated_at         | timestamptz  | YES      | --                  | Last update timestamp.                                                   |
| updated_by         | text         | YES      | --                  | Identity that last updated the row.                                      |

### Primary Key

`id` (uuid)

### Unique Constraints

- `uq_ent_industry_xwalk`: `(source_domain_code, source_code, target_domain_code, target_code)`

### Check Constraints

- `mapping_type IN ('EXACT', 'BROAD', 'NARROW', 'PARTIAL', 'RELATED')`
- `confidence IS NULL OR (confidence >= 0 AND confidence <= 100)`
- `provenance IN ('OFFICIAL', 'AI_GENERATED', 'AI_VERIFIED', 'MANUAL', 'IMPORTED')`

### Foreign Keys

| FK Name / Column(s)                                             | References                           | On Delete             |
| --------------------------------------------------------------- | ------------------------------------ | --------------------- |
| source_domain_code                                              | ref.industry_domain(code)            | (default -- restrict) |
| target_domain_code                                              | ref.industry_domain(code)            | (default -- restrict) |
| fk_ent_industry_xwalk_source: (source_domain_code, source_code) | ref.industry_code(domain_code, code) | (default -- restrict) |
| fk_ent_industry_xwalk_target: (target_domain_code, target_code) | ref.industry_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name            | Columns                           | Notes                               |
| --------------------- | --------------------------------- | ----------------------------------- |
| idx_ent_ixwalk_source | (source_domain_code, source_code) | Lookup mappings from a source code. |
| idx_ent_ixwalk_target | (target_domain_code, target_code) | Reverse lookup by target code.      |

### Relationships

- **References**: `ref.industry_domain` (source and target), `ref.industry_code` (source and target)

---

## ent.category_commodity_map

### Functional Description

Bridges a tenant's internal product categories to standard commodity classification codes (UNSPSC, HS, etc.). This is the table that enables a customer to upload their custom taxonomy and then have it mapped -- manually or via AI -- to international standards. Each mapping carries a confidence score, provenance, and a primary flag to indicate the preferred mapping when multiple exist. This is a tenant-scoped table: different tenants can map the same category structure to different commodity codes.

### Technical Details

| Column                | Type         | Nullable | Default             | Description                                                  |
| --------------------- | ------------ | -------- | ------------------- | ------------------------------------------------------------ |
| id                    | uuid         | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                       |
| tenant_id             | uuid         | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                          |
| category_id           | uuid         | NOT NULL | --                  | Product category being mapped. FK to `ent.product_category`. |
| commodity_domain_code | text         | NOT NULL | --                  | Target commodity domain.                                     |
| commodity_code        | text         | NOT NULL | --                  | Target commodity code.                                       |
| mapping_type          | text         | NOT NULL | `'EXACT'`           | Mapping relation: `EXACT`, `BROAD`, `NARROW`, `PARTIAL`.     |
| confidence            | decimal(5,2) | YES      | --                  | Confidence score (0.00 - 100.00).                            |
| provenance            | text         | NOT NULL | `'MANUAL'`          | Origin of the mapping.                                       |
| is_primary            | boolean      | NOT NULL | `false`             | Whether this is the preferred mapping for the category.      |
| metadata              | jsonb        | NOT NULL | `'{}'::jsonb`       | Extensible metadata.                                         |
| created_at            | timestamptz  | NOT NULL | `now()`             | Row creation timestamp.                                      |
| created_by            | text         | NOT NULL | `'seed'`            | Identity that created the row.                               |
| updated_at            | timestamptz  | YES      | --                  | Last update timestamp.                                       |
| updated_by            | text         | YES      | --                  | Identity that last updated the row.                          |

### Primary Key

`id` (uuid)

### Unique Constraints

- `uq_ent_cat_commodity`: `(tenant_id, category_id, commodity_domain_code, commodity_code)`

### Check Constraints

- `mapping_type IN ('EXACT', 'BROAD', 'NARROW', 'PARTIAL')`
- `confidence IS NULL OR (confidence >= 0 AND confidence <= 100)`
- `provenance IN ('OFFICIAL', 'AI_GENERATED', 'AI_VERIFIED', 'MANUAL', 'IMPORTED')`

### Foreign Keys

| FK Name / Column(s)                                                | References                            | On Delete             |
| ------------------------------------------------------------------ | ------------------------------------- | --------------------- |
| tenant_id                                                          | core.tenant(id)                       | CASCADE               |
| category_id                                                        | ent.product_category(id)              | CASCADE               |
| fk_ent_cat_commodity_code: (commodity_domain_code, commodity_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name                     | Columns                                 | Notes                              |
| ------------------------------ | --------------------------------------- | ---------------------------------- |
| idx_ent_cat_commodity_tenant   | tenant_id                               | Tenant partition scan.             |
| idx_ent_cat_commodity_category | category_id                             | All mappings for a given category. |
| idx_ent_cat_commodity_code     | (commodity_domain_code, commodity_code) | Reverse lookup by commodity code.  |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `ent.product_category` via `category_id`
- **Reference**: `ref.commodity_code` via `(commodity_domain_code, commodity_code)`

---

## ent.classification_config

### Functional Description

Per-tenant configuration that governs classification behavior across the platform. Controls which commodity and industry domains the tenant uses, when classification becomes mandatory (e.g. for regulated items or capital expenditures above a threshold), AI auto-classification thresholds, and cross-border determination triggers. This is a single-row-per-tenant table (tenant_id is the primary key) that acts as the policy hub for all classification decisions.

### Technical Details

| Column                     | Type          | Nullable | Default                               | Description                                                             |
| -------------------------- | ------------- | -------- | ------------------------------------- | ----------------------------------------------------------------------- |
| tenant_id                  | uuid          | NOT NULL | --                                    | Owning tenant. Primary key. FK to `core.tenant`.                        |
| primary_commodity_domain   | text          | YES      | --                                    | Primary commodity classification domain. FK to `ref.commodity_domain`.  |
| trade_commodity_domain     | text          | YES      | --                                    | Trade/customs commodity domain (e.g. HS). FK to `ref.commodity_domain`. |
| primary_industry_domain    | text          | YES      | --                                    | Primary industry classification domain. FK to `ref.industry_domain`.    |
| require_commodity_code     | boolean       | NOT NULL | `false`                               | Whether commodity codes are mandatory on transactional lines.           |
| require_trade_code         | boolean       | NOT NULL | `false`                               | Whether trade/customs codes are mandatory.                              |
| require_for_capex_above    | decimal(18,4) | YES      | --                                    | CapEx threshold above which classification is required.                 |
| require_for_capex_currency | varchar(3)    | YES      | --                                    | Currency of the CapEx threshold. FK to `ref.currency`.                  |
| require_for_regulated      | boolean       | NOT NULL | `true`                                | Whether classification is mandatory for regulated items.                |
| auto_classify_enabled      | boolean       | NOT NULL | `true`                                | Whether AI auto-classification is enabled.                              |
| auto_crosswalk_enabled     | boolean       | NOT NULL | `true`                                | Whether automatic cross-domain mapping is enabled.                      |
| min_confidence_auto        | decimal(5,2)  | NOT NULL | `90.00`                               | Minimum confidence for automatic acceptance of AI suggestions.          |
| min_confidence_suggest     | decimal(5,2)  | NOT NULL | `60.00`                               | Minimum confidence for showing AI suggestions to users.                 |
| crosswalk_strategy         | text          | NOT NULL | `'BEST_MATCH'`                        | Strategy for cross-domain code resolution.                              |
| cross_border_triggers      | jsonb         | NOT NULL | `'["SUPPLIER_COUNTRY_MISMATCH",...]'` | JSON array of cross-border determination trigger conditions.            |
| metadata                   | jsonb         | NOT NULL | `'{}'::jsonb`                         | Extensible metadata.                                                    |
| created_at                 | timestamptz   | NOT NULL | `now()`                               | Row creation timestamp.                                                 |
| created_by                 | text          | NOT NULL | `'seed'`                              | Identity that created the row.                                          |
| updated_at                 | timestamptz   | YES      | --                                    | Last update timestamp.                                                  |
| updated_by                 | text          | YES      | --                                    | Identity that last updated the row.                                     |

### Primary Key

`tenant_id` (uuid) -- one row per tenant

### Check Constraints

- `crosswalk_strategy IN ('EXACT_ONLY', 'BEST_MATCH', 'AI_ASSISTED')`

### Foreign Keys

| FK Column                  | References                 | On Delete             |
| -------------------------- | -------------------------- | --------------------- |
| tenant_id                  | core.tenant(id)            | CASCADE               |
| primary_commodity_domain   | ref.commodity_domain(code) | (default -- restrict) |
| trade_commodity_domain     | ref.commodity_domain(code) | (default -- restrict) |
| primary_industry_domain    | ref.industry_domain(code)  | (default -- restrict) |
| require_for_capex_currency | ref.currency(code)         | (default -- restrict) |

### Indexes

Primary key index on `tenant_id` (implicit).

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **References**: `ref.commodity_domain` (primary and trade), `ref.industry_domain`, `ref.currency`

---

## ent.classification_suggestion

### Functional Description

Records every AI classification prediction for audit and feedback loop purposes. When the platform's classification engine processes a purchase order line, invoice line, or free-text description, it stores its prediction here with the suggested code, confidence score, and model metadata. Users then accept, reject, or override the suggestion, and the resolution is tracked. This table feeds the active learning pipeline: accepted/rejected suggestions become training signal via `ent.classification_feedback`.

### Technical Details

| Column                | Type         | Nullable | Default             | Description                                                       |
| --------------------- | ------------ | -------- | ------------------- | ----------------------------------------------------------------- |
| id                    | uuid         | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                            |
| tenant_id             | uuid         | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                               |
| source_type           | text         | NOT NULL | --                  | Type of entity being classified.                                  |
| source_id             | uuid         | YES      | --                  | Row ID of the source entity (NULL for free-text).                 |
| source_text           | text         | NOT NULL | --                  | The input text that was classified.                               |
| scheme_type           | text         | NOT NULL | --                  | Classification scheme: `COMMODITY`, `INDUSTRY`, `SPEND_CATEGORY`. |
| suggested_domain_code | text         | YES      | --                  | Domain of the suggested code.                                     |
| suggested_code        | text         | NOT NULL | --                  | The AI-predicted classification code.                             |
| confidence            | decimal(5,2) | NOT NULL | --                  | Prediction confidence (0.00 - 100.00).                            |
| model_id              | uuid         | YES      | --                  | AI model identifier.                                              |
| model_version         | text         | YES      | --                  | AI model version string.                                          |
| status                | text         | NOT NULL | `'PENDING'`         | Resolution status.                                                |
| accepted_code         | text         | YES      | --                  | The code actually accepted (may differ if overridden).            |
| resolved_by           | text         | YES      | --                  | Identity that resolved the suggestion.                            |
| resolved_at           | timestamptz  | YES      | --                  | When the suggestion was resolved.                                 |
| created_at            | timestamptz  | NOT NULL | `now()`             | Row creation timestamp.                                           |

### Primary Key

`id` (uuid)

### Check Constraints

- `source_type IN ('PO_LINE', 'PR_LINE', 'INVOICE_LINE', 'CATALOG_ITEM', 'FREE_TEXT')`
- `scheme_type IN ('COMMODITY', 'INDUSTRY', 'SPEND_CATEGORY')`
- `confidence >= 0 AND confidence <= 100`
- `status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'OVERRIDDEN')`

### Foreign Keys

| FK Column | References      | On Delete |
| --------- | --------------- | --------- |
| tenant_id | core.tenant(id) | CASCADE   |

### Indexes

| Index Name                    | Columns                             | Notes                                               |
| ----------------------------- | ----------------------------------- | --------------------------------------------------- |
| idx_ent_cls_suggestion_tenant | tenant_id                           | Tenant partition scan.                              |
| idx_ent_cls_suggestion_source | (tenant_id, source_type, source_id) | Find suggestions for a specific source entity.      |
| idx_ent_cls_suggestion_status | status WHERE status = 'PENDING'     | Partial index for pending suggestion review queues. |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Referenced by**: `ent.classification_feedback.suggestion_id`

---

## ent.classification_feedback

### Functional Description

Captures correction feedback from users, domain experts, bulk imports, and crosswalk verification processes. Every time a user corrects an AI classification or an expert reviews a mapping, the correct answer is recorded here with provenance. This table is the primary training signal for the AI classification model's active learning loop: corrections flow back to improve future prediction accuracy. Feedback rows may optionally link to the original suggestion that was corrected.

### Technical Details

| Column              | Type        | Nullable | Default             | Description                                                                          |
| ------------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------------------------ |
| id                  | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                               |
| tenant_id           | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                                  |
| input_text          | text        | NOT NULL | --                  | The original text that was classified.                                               |
| scheme_type         | text        | NOT NULL | --                  | Classification scheme: `COMMODITY`, `INDUSTRY`, `SPEND_CATEGORY`.                    |
| correct_domain_code | text        | YES      | --                  | Domain of the correct code.                                                          |
| correct_code        | text        | NOT NULL | --                  | The verified correct classification code.                                            |
| source              | text        | NOT NULL | --                  | Feedback source/origin.                                                              |
| suggestion_id       | uuid        | YES      | --                  | Original suggestion being corrected (if any). FK to `ent.classification_suggestion`. |
| metadata            | jsonb       | NOT NULL | `'{}'::jsonb`       | Extensible metadata.                                                                 |
| created_at          | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                                              |
| created_by          | text        | NOT NULL | --                  | Identity that created the feedback.                                                  |

### Primary Key

`id` (uuid)

### Check Constraints

- `scheme_type IN ('COMMODITY', 'INDUSTRY', 'SPEND_CATEGORY')`
- `source IN ('USER_CORRECTION', 'BULK_IMPORT', 'EXPERT_REVIEW', 'CROSSWALK_VERIFY')`

### Foreign Keys

| FK Column     | References                        | On Delete |
| ------------- | --------------------------------- | --------- |
| tenant_id     | core.tenant(id)                   | CASCADE   |
| suggestion_id | ent.classification_suggestion(id) | SET NULL  |

### Indexes

| Index Name                  | Columns                                          | Notes                                        |
| --------------------------- | ------------------------------------------------ | -------------------------------------------- |
| idx_ent_cls_feedback_tenant | tenant_id                                        | Tenant partition scan.                       |
| idx_ent_cls_feedback_scheme | (scheme_type, correct_domain_code, correct_code) | Training data extraction by scheme and code. |

### Relationships

- **Parent**: `core.tenant` via `tenant_id`
- **Reference**: `ent.classification_suggestion` via `suggestion_id`

---

## Entity-Relationship Summary

```
core.tenant
  |--- ent.customer (tenant_id)
  |--- ent.supplier (tenant_id)
  |--- ent.employee (tenant_id)
  |--- ent.product_category (tenant_id)
  |--- ent.product (tenant_id)
  |--- ent.entity_relationship (tenant_id)
  |--- ent.category_commodity_map (tenant_id)
  |--- ent.classification_config (tenant_id, 1:1)
  |--- ent.classification_suggestion (tenant_id)
  |--- ent.classification_feedback (tenant_id)

ent.product_category
  |--- ent.product_category (parent_id)           [self-ref hierarchy]
  |--- ent.product (category_id)
  |--- ent.category_commodity_map (category_id)

ent.employee
  |--- ent.employee (manager_id)                   [self-ref hierarchy]

ref.industry_code
  |<-- ent.customer (industry_domain_code, industry_code)
  |<-- ent.supplier (industry_domain_code, industry_code)

ref.commodity_code
  |<-- ent.product_category (commodity_domain_code, commodity_code)
  |<-- ent.product (commodity_domain_code, commodity_code)
  |<-- ent.commodity_crosswalk (source + target)
  |<-- ent.category_commodity_map (commodity_domain_code, commodity_code)

ent.classification_suggestion
  |<-- ent.classification_feedback (suggestion_id)
```

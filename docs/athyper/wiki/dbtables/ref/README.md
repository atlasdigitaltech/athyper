# ref Schema -- Reference Data

**Source DDL**: `framework/adapters/db/src/sql/030_ref.sql`
**PostgreSQL**: 16+

The `ref` schema contains immutable or slowly-changing reference data used across the entire platform. Tables follow international standards (ISO, IANA, UN/ECE, UNSPSC, ISIC/NAICS) and provide a single source of truth for codes, names, and classifications. All reference tables share a common audit pattern (`created_at`, `created_by`, `updated_at`, `updated_by`) and a `status` column with `active`/`deprecated` lifecycle.

---

## Table of Contents

1. [ref.country](#refcountry)
2. [ref.state_region](#refstate_region)
3. [ref.currency](#refcurrency)
4. [ref.language](#reflanguage)
5. [ref.locale](#reflocale)
6. [ref.timezone](#reftimezone)
7. [ref.uom](#refuom)
8. [ref.commodity_domain](#refcommodity_domain)
9. [ref.commodity_code](#refcommodity_code)
10. [ref.industry_domain](#refindustry_domain)
11. [ref.industry_code](#refindustry_code)
12. [ref.label](#reflabel)
13. [ref.localized_name() (Function)](#reflocalized_name-function)

---

## ref.country

### Functional Description

Stores sovereign countries and territories using the ISO 3166-1 standard. Each row carries the alpha-2 code (primary key), alpha-3 code, and numeric code along with geographic region/subregion classifications. This table is the root reference for all country-dependent data in the platform including addresses, locales, state/region subdivisions, and regulatory jurisdictions.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code2 | char(2) | NOT NULL | -- | ISO 3166-1 alpha-2 country code (e.g. `US`, `DE`). Primary key. |
| code3 | char(3) | YES | -- | ISO 3166-1 alpha-3 country code (e.g. `USA`, `DEU`). Unique. |
| numeric3 | char(3) | YES | -- | ISO 3166-1 numeric code (e.g. `840`, `276`). Unique. |
| name | text | NOT NULL | -- | Short English country name. |
| official_name | text | YES | -- | Official English name (e.g. `United States of America`). |
| region | text | YES | -- | Geographic region (e.g. `Americas`, `Europe`). |
| subregion | text | YES | -- | Geographic subregion (e.g. `Northern America`, `Western Europe`). |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code2` (char(2))

### Unique Constraints

- `code3` -- alpha-3 code uniqueness
- `numeric3` -- numeric code uniqueness

### Check Constraints

- `country_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

None.

### Indexes

Primary key index on `code2` (implicit).

### Relationships

- **Referenced by**: `ref.state_region.country_code2`, `ref.locale.country_code2`

---

## ref.state_region

### Functional Description

Stores administrative subdivisions of countries following the ISO 3166-2 standard. Each subdivision (state, province, territory, department, etc.) is linked to its parent country and may optionally reference a parent subdivision for hierarchical administrative structures. The `category` column classifies the type of subdivision (e.g. `state`, `province`, `territory`).

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | ISO 3166-2 subdivision code (e.g. `US-CA`, `DE-BY`). Primary key. |
| country_code2 | char(2) | NOT NULL | -- | Parent country alpha-2 code. |
| name | text | NOT NULL | -- | English name of the subdivision. |
| category | text | YES | -- | Subdivision type (e.g. `state`, `province`, `territory`). |
| parent_code | text | YES | -- | Parent subdivision code for hierarchical regions. Self-referencing FK. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `state_region_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

| FK Column | References | On Delete |
|-----------|-----------|-----------|
| country_code2 | ref.country(code2) | CASCADE |
| parent_code | ref.state_region(code) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_state_region_country | country_code2 | Lookup by country. |
| idx_state_region_parent | parent_code | Hierarchical traversal. |
| idx_state_region_category | category | Filter by subdivision type. |

### Relationships

- **Parent**: `ref.country` via `country_code2`
- **Self-referencing**: `parent_code` for hierarchical subdivisions

---

## ref.currency

### Functional Description

Stores world currencies following the ISO 4217 standard. Each row records the alphabetic currency code, display symbol, and the number of minor units (decimal places) used in monetary calculations. This table is referenced by any entity that needs to express monetary values, including supplier payment terms, product pricing, and classification policy thresholds.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | char(3) | NOT NULL | -- | ISO 4217 alphabetic currency code (e.g. `USD`, `EUR`). Primary key. |
| name | text | NOT NULL | -- | English currency name (e.g. `US Dollar`). |
| symbol | text | YES | -- | Currency symbol (e.g. `$`, `EUR`). |
| minor_units | int | YES | -- | Number of decimal places (e.g. `2` for USD, `0` for JPY). |
| numeric3 | char(3) | YES | -- | ISO 4217 numeric code. Unique. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (char(3))

### Unique Constraints

- `numeric3` -- numeric code uniqueness

### Check Constraints

- `currency_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

None.

### Indexes

Primary key index on `code` (implicit).

### Relationships

- **Referenced by**: `ent.supplier.currency_code` (informal -- no DDL FK), `ent.classification_config.require_for_capex_currency`

---

## ref.language

### Functional Description

Stores human languages following the ISO 639 standard (preferring ISO 639-1 two-letter codes). Each entry records the English name, native-language name, an optional ISO 639-2 three-letter code, and the text direction (left-to-right or right-to-left). Languages are the foundation for locale construction and drive i18n label resolution across the platform.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | ISO 639 language code (prefer 639-1 two-letter). Primary key. |
| name | text | NOT NULL | -- | English language name (e.g. `English`, `German`). |
| native_name | text | YES | -- | Name in the language itself (e.g. `Deutsch`). |
| iso639_2 | text | YES | -- | ISO 639-2 (three-letter) code. |
| direction | text | NOT NULL | `'ltr'` | Text direction: `ltr` or `rtl`. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `language_dir_chk`: `direction IN ('ltr', 'rtl')`
- `language_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

None.

### Indexes

Primary key index on `code` (implicit).

### Relationships

- **Referenced by**: `ref.locale.language_code`

---

## ref.locale

### Functional Description

Represents BCP 47 locale tags that combine a language, an optional country, and an optional script subtag into a single identifier (e.g. `en-US`, `zh-Hans-CN`). Locales are used throughout the platform for user interface language selection, date/number formatting, and as the key for i18n label lookups. Each locale links back to its constituent language and country reference rows.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | BCP 47 locale tag (e.g. `en-US`, `de-DE`). Primary key. |
| language_code | text | NOT NULL | -- | ISO 639 language code. |
| country_code2 | char(2) | YES | -- | ISO 3166-1 alpha-2 country code (optional). |
| script | text | YES | -- | Script subtag (e.g. `Hans`, `Latn`). |
| name | text | NOT NULL | -- | Human-readable locale name (e.g. `English (United States)`). |
| direction | text | YES | -- | Text direction override (`ltr` or `rtl`). NULL inherits from language. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `locale_status_chk`: `status IN ('active', 'deprecated')`
- `locale_dir_chk`: `direction IS NULL OR direction IN ('ltr', 'rtl')`

### Foreign Keys

| FK Column | References | On Delete |
|-----------|-----------|-----------|
| language_code | ref.language(code) | (default -- restrict) |
| country_code2 | ref.country(code2) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_locale_language | language_code | Look up locales by language. |
| idx_locale_country | country_code2 | Look up locales by country. |

### Relationships

- **Parents**: `ref.language` via `language_code`, `ref.country` via `country_code2`
- **Referenced by**: `ref.label.locale_code`

---

## ref.timezone

### Functional Description

Stores IANA time zone database identifiers (e.g. `America/New_York`, `Europe/Berlin`). Supports canonical/alias relationships so that deprecated or alternate zone names can be resolved to their canonical form. The `utc_offset` column provides a human-readable baseline offset, though actual offset depends on daylight saving rules.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tzid | text | NOT NULL | -- | IANA time zone identifier. Primary key. |
| display_name | text | YES | -- | Human-readable display name. |
| utc_offset | text | YES | -- | Standard UTC offset string (e.g. `+05:30`, `-08:00`). |
| is_alias | boolean | NOT NULL | `false` | Whether this is an alias for another canonical zone. |
| canonical_tzid | text | YES | -- | Canonical zone this alias resolves to. Self-referencing FK. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`tzid` (text)

### Check Constraints

- `timezone_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

| FK Column | References | On Delete |
|-----------|-----------|-----------|
| canonical_tzid | ref.timezone(tzid) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_timezone_canonical | canonical_tzid | Resolve aliases to canonical zone. |

### Relationships

- **Self-referencing**: `canonical_tzid` points to the canonical timezone row when `is_alias = true`.

---

## ref.uom

### Functional Description

Stores units of measure following the UN/ECE Recommendation 20 standard. Each unit has a code, name, optional symbol, and a quantity-type classification that groups units into physical dimensions (mass, length, volume, etc.). This table is referenced by product definitions and any transactional data that requires dimensional measurement.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | UN/ECE Rec 20 unit code (e.g. `KGM`, `MTR`). Primary key. |
| name | text | NOT NULL | -- | Unit name (e.g. `kilogram`, `metre`). |
| symbol | text | YES | -- | Display symbol (e.g. `kg`, `m`). |
| quantity_type | text | YES | -- | Physical quantity category. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `uom_status_chk`: `status IN ('active', 'deprecated')`
- `uom_qty_type_chk`: `quantity_type IS NULL OR quantity_type IN ('mass', 'length', 'volume', 'area', 'time', 'temperature', 'count', 'force', 'pressure', 'energy', 'data', 'speed', 'density', 'frequency', 'electric', 'angle', 'currency')`

### Foreign Keys

None.

### Indexes

Primary key index on `code` (implicit).

### Relationships

- **Referenced by**: `ent.product.unit_of_measure` (informal -- no DDL FK)

---

## ref.commodity_domain

### Functional Description

Defines commodity classification systems (domains) such as UNSPSC, Harmonized System (HS), or customer-specific custom taxonomies. Each domain records the standard name, version, hierarchy depth (number of classification levels), and an optional regex pattern for code validation. Commodity domains are the parent context for all commodity codes and drive procurement classification logic.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | Domain identifier (e.g. `unspsc`, `hs`). Primary key. |
| name | text | NOT NULL | -- | Human-readable domain name. |
| standard | text | YES | -- | Governing standard body/name. |
| version | text | YES | -- | Version of the standard in use. |
| hierarchy_depth | smallint | YES | -- | Number of hierarchy levels (e.g. 4 for UNSPSC, 6 for HS). |
| code_pattern | text | YES | -- | Validation regex for codes in this domain. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `commodity_domain_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

None.

### Indexes

Primary key index on `code` (implicit).

### Relationships

- **Referenced by**: `ref.commodity_code.domain_code`, `ent.commodity_crosswalk`, `ent.classification_config.primary_commodity_domain`, `ent.classification_config.trade_commodity_domain`

---

## ref.commodity_code

### Functional Description

Stores hierarchical commodity classification codes within a given domain (UNSPSC segments/families/classes/commodities, HS chapters/headings/subheadings, etc.). Each code sits at a specific hierarchy level, may reference a parent code for tree traversal, and carries a `keywords` array for type-ahead search. The `is_leaf` flag identifies the finest-grain postable level for transactional classification.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| domain_code | text | NOT NULL | -- | Commodity domain this code belongs to. Composite PK part 1. |
| code | text | NOT NULL | -- | Classification code within the domain. Composite PK part 2. |
| name | text | NOT NULL | -- | Code description/name. |
| description | text | YES | -- | Extended description. |
| parent_code | text | YES | -- | Parent code within the same domain (self-referencing). |
| level_no | int | YES | -- | Hierarchy level (1 = top segment, increasing downward). |
| keywords | text[] | YES | -- | Type-ahead search keywords (e.g. `{'laptop','notebook','portable computer'}`). |
| is_leaf | boolean | NOT NULL | `false` | True if this is the finest-grain postable level. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`(domain_code, code)` -- composite

### Check Constraints

- `commodity_code_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

| FK Column(s) | References | On Delete |
|--------------|-----------|-----------|
| domain_code | ref.commodity_domain(code) | CASCADE |
| (domain_code, parent_code) | ref.commodity_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_commodity_code_parent | (domain_code, parent_code) | Hierarchical tree traversal. |
| idx_commodity_code_level | (domain_code, level_no) | Filter by hierarchy level. |
| idx_commodity_code_keywords | keywords (GIN) | Type-ahead / full-text search on keywords array. |

### Relationships

- **Parent**: `ref.commodity_domain` via `domain_code`
- **Self-referencing**: `(domain_code, parent_code)` for tree hierarchy
- **Referenced by**: `ent.product_category`, `ent.product`, `ent.commodity_crosswalk`, `ent.category_commodity_map`

---

## ref.industry_domain

### Functional Description

Defines industry classification systems (domains) such as ISIC (International Standard Industrial Classification), NAICS (North American Industry Classification System), or customer-specific custom taxonomies. Like commodity domains, each entry records the standard, version, hierarchy depth, and optional code validation pattern. Industry domains contextualize the industry codes used for customer and supplier classification.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| code | text | NOT NULL | -- | Domain identifier (e.g. `isic`, `naics`). Primary key. |
| name | text | NOT NULL | -- | Human-readable domain name. |
| standard | text | YES | -- | Governing standard body/name. |
| version | text | YES | -- | Version of the standard in use. |
| hierarchy_depth | smallint | YES | -- | Number of hierarchy levels (e.g. 4 for ISIC, 5 for NAICS). |
| code_pattern | text | YES | -- | Validation regex for codes in this domain. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`code` (text)

### Check Constraints

- `industry_domain_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

None.

### Indexes

Primary key index on `code` (implicit).

### Relationships

- **Referenced by**: `ref.industry_code.domain_code`, `ent.industry_crosswalk`, `ent.classification_config.primary_industry_domain`

---

## ref.industry_code

### Functional Description

Stores hierarchical industry classification codes within a given domain (ISIC divisions/groups/classes, NAICS sectors/subsectors, etc.). Mirrors the structure of `ref.commodity_code` with parent-code hierarchy, level numbering, keywords for search, and a leaf indicator. Industry codes are assigned to customers and suppliers to classify their business sector for analytics, regulatory, and compliance purposes.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| domain_code | text | NOT NULL | -- | Industry domain this code belongs to. Composite PK part 1. |
| code | text | NOT NULL | -- | Classification code within the domain. Composite PK part 2. |
| name | text | NOT NULL | -- | Code description/name. |
| description | text | YES | -- | Extended description. |
| parent_code | text | YES | -- | Parent code within the same domain (self-referencing). |
| level_no | int | YES | -- | Hierarchy level (1 = top sector, increasing downward). |
| keywords | text[] | YES | -- | Type-ahead search keywords. |
| is_leaf | boolean | NOT NULL | `false` | True if this is the finest-grain postable level. |
| status | text | NOT NULL | `'active'` | Lifecycle status. |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | Extensible metadata. |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`(domain_code, code)` -- composite

### Check Constraints

- `industry_code_status_chk`: `status IN ('active', 'deprecated')`

### Foreign Keys

| FK Column(s) | References | On Delete |
|--------------|-----------|-----------|
| domain_code | ref.industry_domain(code) | CASCADE |
| (domain_code, parent_code) | ref.industry_code(domain_code, code) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_industry_code_parent | (domain_code, parent_code) | Hierarchical tree traversal. |
| idx_industry_code_level | (domain_code, level_no) | Filter by hierarchy level. |
| idx_industry_code_keywords | keywords (GIN) | Type-ahead / full-text search on keywords array. |

### Relationships

- **Parent**: `ref.industry_domain` via `domain_code`
- **Self-referencing**: `(domain_code, parent_code)` for tree hierarchy
- **Referenced by**: `ent.customer.(industry_domain_code, industry_code)`, `ent.supplier.(industry_domain_code, industry_code)`, `ent.industry_crosswalk`

---

## ref.label

### Functional Description

Provides i18n (internationalization) translations for any reference data entity. The English canonical name is stored on the source table itself; this table holds all additional locale-specific translations. Each label is identified by a triple of (entity name, code, locale code) and stores the translated `name` and optional `description`. This enables the platform to present reference data in the user's preferred language.

### Technical Details

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| entity | text | NOT NULL | -- | Reference entity name (e.g. `country`, `currency`). Composite PK part 1. |
| code | text | NOT NULL | -- | Code of the reference entity row (e.g. `US`, `USD`). Composite PK part 2. |
| locale_code | text | NOT NULL | -- | BCP 47 locale code. Composite PK part 3. FK to `ref.locale`. |
| name | text | NOT NULL | -- | Translated name in the target locale. |
| description | text | YES | -- | Translated description (optional). |
| created_at | timestamptz | NOT NULL | `now()` | Row creation timestamp. |
| created_by | text | NOT NULL | `'seed'` | Identity that created the row. |
| updated_at | timestamptz | YES | -- | Last update timestamp. |
| updated_by | text | YES | -- | Identity that last updated the row. |

### Primary Key

`(entity, code, locale_code)` -- composite

### Foreign Keys

| FK Column | References | On Delete |
|-----------|-----------|-----------|
| locale_code | ref.locale(code) | (default -- restrict) |

### Indexes

| Index Name | Columns | Notes |
|------------|---------|-------|
| idx_label_locale | locale_code | Filter all labels by locale. |
| idx_label_entity_locale | (entity, locale_code) | Fast lookup for all codes of a given entity in a given locale. |

### Relationships

- **Parent**: `ref.locale` via `locale_code`
- **Used by**: `ref.localized_name()` function

---

## ref.localized_name() (Function)

### Functional Description

A SQL helper function that resolves the localized display name for any reference data entity. Given an entity name, a code, and a target locale, it first attempts an exact locale match (e.g. `pt-BR`), then falls back to the base language prefix (e.g. `pt`). Returns `NULL` if no translation exists, allowing callers to fall back to the English canonical name stored on the source table.

### Signature

```sql
ref.localized_name(p_entity text, p_code text, p_locale text) RETURNS text
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| p_entity | text | Reference entity name (e.g. `'country'`, `'currency'`). |
| p_code | text | Code of the entity row to translate. |
| p_locale | text | Target BCP 47 locale (e.g. `'de-DE'`, `'ja'`). |

### Behavior

1. Query `ref.label` for an exact match on `(entity, code, locale_code)`.
2. If no exact match, query again using only the language prefix (everything before the first `-`).
3. Return the first non-null `name` found, or `NULL` if neither match exists.

### Properties

- **Language**: SQL
- **Volatility**: STABLE (does not modify data; safe for index use)

---

## Entity-Relationship Summary

```
ref.country
  |--- ref.state_region (country_code2 -> code2)
  |--- ref.locale (country_code2 -> code2)

ref.language
  |--- ref.locale (language_code -> code)

ref.locale
  |--- ref.label (locale_code -> code)

ref.timezone
  |--- ref.timezone (canonical_tzid -> tzid)  [self-ref alias]

ref.commodity_domain
  |--- ref.commodity_code (domain_code -> code)

ref.commodity_code
  |--- ref.commodity_code (parent_code)  [self-ref hierarchy]

ref.industry_domain
  |--- ref.industry_code (domain_code -> code)

ref.industry_code
  |--- ref.industry_code (parent_code)  [self-ref hierarchy]
```

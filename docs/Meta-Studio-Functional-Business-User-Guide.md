# Meta Studio — Functional Business User Guide

**Product**: Athyper Neon Platform
**Module**: Meta Studio (Schema Management)
**Version**: v1 — Effective
**Date**: 2026-03-11

---

## Table of Contents

1. [Overview](#1-overview)
2. [Accessing Meta Studio](#2-accessing-meta-studio)
3. [Schema Explorer — Entity List](#3-schema-explorer--entity-list)
4. [Entity Detail View](#4-entity-detail-view)
5. [Fields Tab](#5-fields-tab)
6. [Relations Tab](#6-relations-tab)
7. [Diagram Tab](#7-diagram-tab)
8. [Indexes Tab](#8-indexes-tab)
9. [Versions Tab](#9-versions-tab)
10. [Compiled Tab](#10-compiled-tab)
11. [Lifecycle Tab](#11-lifecycle-tab)
12. [Workflows Tab](#12-workflows-tab)
13. [Policies Tab](#13-policies-tab)
14. [Validation Tab](#14-validation-tab)
15. [Forms Tab](#15-forms-tab)
16. [Views Tab](#16-views-tab)
17. [Integrations Tab](#17-integrations-tab)
18. [Overlays Tab](#18-overlays-tab)
19. [Activity & Audit Trail](#19-activity--audit-trail)
20. [Publishing & Compilation Workflow](#20-publishing--compilation-workflow)
21. [Bulk Operations](#21-bulk-operations)
22. [Version Diffing & Impact Analysis](#22-version-diffing--impact-analysis)
23. [Change Requests](#23-change-requests)
24. [System Constraints & Limits](#24-system-constraints--limits)
25. [Glossary](#25-glossary)

---

## 1. Overview

### What is Meta Studio?

Meta Studio is the **schema management workbench** within the Athyper Neon platform. It allows administrators and business users to define, configure, and publish the data structures (called **entities**) that power the entire application — without writing code.

### What Can You Do with Meta Studio?

| Capability | Description |
|---|---|
| **Define Entities** | Create and manage data schemas (e.g., Purchase Invoice, Sales Order, Product) |
| **Manage Fields** | Add, edit, reorder, and remove fields with rich data types and constraints |
| **Define Relationships** | Establish links between entities (one-to-many, many-to-many, belongs-to) |
| **Set Validation Rules** | Configure business rules that enforce data quality on create, update, or transition |
| **Configure Policies** | Control access, visibility, and field-level security using roles and attributes |
| **Design Forms** | Layout form UIs for data entry screens |
| **Configure Views** | Design list/grid views for browsing entity records |
| **Manage Lifecycles** | Define state machines with states and transitions for document workflows |
| **Version & Publish** | Track schema changes across versions, compare diffs, and publish when ready |
| **Apply Overlays** | Make tenant-specific or context-specific schema modifications without changing the base schema |
| **Visualize Relationships** | View entity-relationship diagrams interactively |
| **Audit Everything** | Every change is tracked with full audit trail |

### Who Uses Meta Studio?

| Role | Typical Activities |
|---|---|
| **Solution Architect** | Designs entity structures, relations, and lifecycle flows |
| **Business Analyst** | Defines fields, validation rules, and form layouts |
| **Application Admin** | Manages policies, publishes versions, monitors activity |
| **Implementation Consultant** | Applies overlays for client-specific customizations |

---

## 2. Accessing Meta Studio

### Navigation Path

```
Admin Workbench → Mesh → Meta Studio
```

**URL Pattern**: `/wb/{workbench}/mesh/meta-studio`

### Prerequisites

- User must have an **Admin session** (administrator role)
- Access is tenant-scoped — each tenant sees only their own entities

### Test Mode

A **Test Mode** indicator appears in the top navigation bar when the environment is running in development/staging mode. In test mode, stub data may be served for demonstration purposes.

---

## 3. Schema Explorer — Entity List

The landing page of Meta Studio displays the **Schema Explorer** — a searchable, sortable list of all entities defined for the current tenant.

### What You See

| Column | Description |
|---|---|
| **Entity Name** | The unique technical name (snake_case), e.g., `purchase_invoice` |
| **Kind** | The entity classification badge (see below) |
| **Version** | Current version number and status (draft / effective / archived) |
| **Status** | Active or inactive indicator |

### Entity Kinds

| Kind | Label | Description |
|---|---|---|
| `ref` | Reference | Static/lookup data (e.g., Currency, Country) |
| `ent` | Entity | Core business objects (e.g., Customer, Supplier) |
| `doc` | Document | Transactional documents (e.g., Purchase Invoice, Sales Order) |
| `fin` | Finance | Financial entities (e.g., Journal Entry, Ledger) |
| `cfg` | Configuration | System configuration data |
| `int` | Integration | Integration mapping entities |

### Entity Classes

| Class | Description |
|---|---|
| **MASTER** | Master data entities (long-lived, reference-heavy) |
| **TRANSACTIONAL** | Transaction records (event-driven, time-stamped) |
| **REFERENCE** | Lookup/reference data (relatively static) |

### Available Actions

- **+ Add Entity**: Create a new entity (opens creation form)
- **Search**: Filter entities by name
- **Click Entity Row**: Navigate to the entity detail view
- **Delete Entity**: Remove an entity (only if in draft status and no dependencies)

### Creating a New Entity

When creating an entity, you provide:

| Field | Required | Description |
|---|---|---|
| **Name** | Yes | Unique snake_case name (max 128 characters) |
| **Kind** | Yes | Entity kind (ref, ent, doc, fin, cfg, int) |
| **Table Schema** | No | Database schema (default: `public`, max 63 chars) |
| **Table Name** | Yes | Physical table name (snake_case) |
| **Module ID** | No | Logical grouping module |
| **Governance Level** | No | `full`, `light`, or `audit_only` (default: `full`) |
| **Engine Tag** | No | Custom engine/processing tag (max 128 chars) |
| **Identity Config** | No | Primary label field, code field, alternate keys, search aliases, display template |

---

## 4. Entity Detail View

After selecting an entity, you enter the **Entity Detail View**. This page has:

### Header

- **Entity Name** with kind badge (e.g., `PurchaseInvoice [Document]`)
- **Version indicator** (e.g., `v1 - effective`)
- **Activity button** — opens the audit trail drawer
- **Action menu** (kebab icon) — additional operations

### Tab Navigation

The detail view is organized into **14 tabs** grouped by function:

| Group | Tabs |
|---|---|
| **Structural** | Fields, Relations, Diagram, Indexes, Versions, Compiled |
| **Behavioral** | Lifecycle, Workflows, Policies, Validation |
| **Experience** | Forms, Views |
| **Connectivity** | Integrations |
| **Tenant Variation** | Overlays |

Tabs may show **dot indicators** (colored dots) when they contain data or require attention.

---

## 5. Fields Tab

The **Fields** tab is the primary workspace for defining the data structure of an entity. This is where you manage every attribute/column the entity will have.

### Field List View

Displays all fields in a sortable, draggable list with:

| Display Element | Description |
|---|---|
| **Drag Handle** (⋮⋮) | Reorder fields by dragging |
| **Field Icon** | `T` for text/basic types, link icon for references (uuid) |
| **Display Name** | Human-readable label |
| **Technical Name** | Snake_case column name in parentheses |
| **Data Type Badge** | e.g., `text`, `uuid`, `number`, `boolean` |
| **Required Badge** | Orange "required" badge for mandatory fields |
| **Field Count** | Total number of fields shown at the top (e.g., "Fields 34") |

### Actions

- **+ Add Field**: Opens the field creation dialog
- **Show System (N)**: Toggle to show/hide system-managed fields (id, tenant_id, created_at, etc.)
- **Refresh**: Reload fields from server
- **Click Field Row**: Open field editing dialog
- **Drag & Drop**: Reorder fields (saved automatically)
- **Delete Field**: Remove a field (only in draft version)

### Supported Data Types

| Data Type | Description | Example Use |
|---|---|---|
| `string` | Short text (single-line) | Names, codes, references |
| `text` | Long text (multi-line) | Descriptions, notes |
| `number` | Floating-point number | Quantities, rates |
| `integer` | Whole number | Counts, sequence numbers |
| `decimal` | Fixed-precision decimal | Monetary amounts, percentages |
| `boolean` | True/false | Flags, toggles |
| `date` | Calendar date (no time) | Due dates, effective dates |
| `datetime` | Date with time | Timestamps, event times |
| `uuid` | Universally unique identifier | Foreign keys, references |
| `reference` | Link to another entity | Supplier, Customer lookups |
| `enum` | Predefined value list | Status, category, type |
| `json` | Structured JSON object | Complex nested data |
| `rich_text` | Formatted text (HTML/Markdown) | Rich descriptions |

### UI Types

Each field has a **UI type** that controls how it renders in forms:

| UI Type | Description |
|---|---|
| `text` | Standard text input |
| `textarea` | Multi-line text area |
| `number` | Numeric input with stepper |
| `toggle` | On/off toggle switch |
| `select` | Dropdown selection |
| `datepicker` | Calendar date picker |
| `reference-picker` | Entity lookup/search picker |
| `json-editor` | JSON code editor |
| `hidden` | Not shown in UI (system use) |

### Field Configuration — Full Detail

When creating or editing a field, the following properties are available:

#### Basic Properties

| Property | Type | Description |
|---|---|---|
| **Name** | string | Technical field name (snake_case, non-reserved) |
| **Column Name** | string | Physical database column name |
| **Data Type** | enum | One of the 14 supported data types |
| **UI Type** | enum | How the field renders in forms |
| **Label** | string | Human-readable display name (max 256 chars) |
| **Description** | string | Help text shown to users (max 2048 chars) |
| **Default Value** | any | Pre-populated value for new records |

#### Flags

| Flag | Description |
|---|---|
| **Required** | Field must have a value |
| **Unique** | Value must be unique across all records |
| **Searchable** | Field is included in search indexes |
| **Filterable** | Field appears as a filter option in list views |
| **Read Only** | Value cannot be edited after creation |
| **Deprecated** | Field is marked for future removal |
| **Computed** | Value is calculated, not user-entered |
| **Write Once** | Value can only be set once (on create) |
| **Sortable** | Records can be sorted by this field |
| **Groupable** | Records can be grouped by this field |
| **Aggregatable** | Field supports aggregate operations (sum, avg, count) |

#### Semantic Properties

| Property | Description |
|---|---|
| **Format** | Semantic format hint: `email`, `phone`, `url`, `money`, `percent`, `password`, `color`, `country`, `timezone`, `markdown`, `html`, `ip_address`, `slug` |
| **Unit** | Measurement unit (e.g., `kg`, `USD`, `meters`) |
| **Cardinality** | `one` (single value) or `many` (array of values) |
| **Origin** | `system` (platform-managed) or `business` (user-defined) |

#### Data Type Constraints

Constraints are **type-specific** and enforce data integrity:

| Data Type | Available Constraints |
|---|---|
| **String / Text** | `minLength`, `maxLength`, `pattern` (regex) |
| **Number / Integer / Decimal** | `min`, `max`, `precision`, `scale` |
| **Date / Datetime** | `minDate`, `maxDate` |
| **Enum** | `allowedValues` (list of valid options, max 500 values) |
| **All types** | `required`, `nullable` |

#### Visibility Rules

Control when the field is shown:

| Context | Options | Description |
|---|---|---|
| **Create** | `visible`, `hidden`, `internal` | Shown when creating a new record |
| **View** | `visible`, `hidden`, `internal` | Shown in record detail view |
| **Edit** | `visible`, `hidden`, `internal` | Shown when editing a record |

#### Editability Rules

Control when the field can be modified:

| Context | Options | Description |
|---|---|---|
| **Create** | `editable`, `read_only`, `system_managed`, `computed` | Editable on create forms |
| **Edit** | `editable`, `read_only`, `system_managed`, `computed` | Editable on edit forms |

#### Computed Fields

For fields where the value is calculated automatically:

| Property | Description |
|---|---|
| **Compute Mode** | `virtual` (calculated on read, not stored) or `materialized` (calculated and stored) |
| **Compute Expression Type** | `formula` (custom expression), `aggregate` (rollup), or `system` (platform function) |
| **Expression** | The calculation formula or function |
| **Depends On** | List of fields this computation references |
| **Recompute Trigger** | `on_dependency_change`, `on_save`, or `scheduled` |
| **Stale Policy** | `serve_stale`, `null_until_recomputed`, or `recompute_sync` |

#### Reference / Lookup Configuration

For fields that reference other entities:

| Property | Description |
|---|---|
| **Display Template** | How referenced records appear (e.g., `{name} ({code})`) |
| **Search Fields** | Which fields of the target entity are searchable (max 20) |
| **Match Mode** | `exact`, `prefix`, `contains`, or `token` |
| **Filters** | Static filters applied to the lookup query |
| **Min Chars** | Minimum characters before search triggers |
| **Debounce (ms)** | Delay before search fires |
| **Page Size** | Number of results per page |
| **Cache Mode** | `none`, `session`, or `global` |

#### Enum Configuration

For fields with predefined value lists:

| Property | Description |
|---|---|
| **Allowed Values** | Array of valid options (max 500) |
| **Multi-select** | Allow selecting multiple values |

#### Money Configuration

For monetary fields:

| Property | Description |
|---|---|
| **Currency Field** | Field that holds the currency code |
| **Precision** | Decimal places |
| **Rounding Mode** | How to round values |

#### Collection Behavior (Child Entities)

When a field represents a collection of child records:

| Property | Description |
|---|---|
| **Ownership** | `owned` (parent owns child lifecycle) or `linked` (independent) |
| **Persistence Mode** | `inline` (embedded) or `reference_only` (foreign key) |
| **Delete Mode** | `cascade` (delete children), `restrict` (prevent delete), `detach` (unlink) |
| **Ordering** | Whether child records maintain sort order |
| **Editor Style** | `grid` (table), `subform` (nested form), or `tags` (tag input) |
| **Min/Max Items** | Minimum and maximum number of child records |
| **Allow Duplicates** | Whether duplicate values are permitted |

### Reserved Field Names

The following field names are **reserved by the system** and cannot be used for custom fields:

```
id, tenant_id, realm_id, created_at, created_by,
updated_at, updated_by, deleted_at, deleted_by, version
```

These fields are automatically managed by the platform.

---

## 6. Relations Tab

The **Relations** tab defines how entities are connected to each other.

### Relation Types

| Type | Cardinality | Description | Example |
|---|---|---|---|
| **belongs_to** | N:1 | This entity belongs to one parent | Invoice → Supplier |
| **has_many** | 1:N | This entity has many children | Invoice → Invoice Lines |
| **m2m** | M:N | Many-to-many via junction table | Product ↔ Category |

### Relation Properties

| Property | Required | Description |
|---|---|---|
| **Name** | Yes | Relation name (snake_case) |
| **Relation Kind** | Yes | `belongs_to`, `has_many`, or `m2m` |
| **Target Entity** | Yes | The entity being referenced |
| **FK Field** | No | Foreign key field name (auto-derived for belongs_to) |
| **Target Key** | No | Key field on the target entity (defaults to `id`) |
| **On Delete** | No | Referential action: `restrict` (default), `cascade`, or `set_null` |
| **UI Behavior** | No | UI-specific configuration hints (JSON) |

### On Delete Behaviors

| Action | Description |
|---|---|
| **Restrict** | Prevent deletion if related records exist |
| **Cascade** | Delete all related records automatically |
| **Set Null** | Set the foreign key to null (unlink) |

### Viewing Relations

- Relations are displayed in a list with source entity, target entity, kind, and FK field
- A **Relation Graph** visualization is also available showing connections

---

## 7. Diagram Tab

The **Diagram** tab provides an **interactive Entity-Relationship Diagram (ERD)** using a visual flow diagram.

### Features

| Feature | Description |
|---|---|
| **Auto-layout** | Entities are automatically arranged for clarity |
| **Interactive Nodes** | Click on any entity node to navigate to it |
| **Relation Lines** | Arrows show the direction and type of relationships |
| **Zoom & Pan** | Scroll to zoom, drag to pan across large diagrams |
| **Highlighted Context** | Current entity is visually highlighted |

### Use Case

- Understand the data model at a glance
- Identify missing or incorrect relationships
- Communicate the schema structure to stakeholders

---

## 8. Indexes Tab

The **Indexes** tab manages database indexes for optimizing query performance.

### Index Properties

| Property | Required | Description |
|---|---|---|
| **Name** | Yes | Index name (snake_case) |
| **Is Unique** | No | Whether this is a uniqueness constraint (default: false) |
| **Method** | No | Index algorithm (default: `btree`) |
| **Columns** | Yes | Fields included in the index (1-16 columns) |
| **WHERE Clause** | No | Partial index filter condition (max 1024 chars) |

### Index Methods

| Method | Description | Best For |
|---|---|---|
| **btree** | B-tree (default) | Equality and range queries, sorting |
| **gin** | Generalized Inverted Index | Full-text search, array contains, JSON queries |
| **gist** | Generalized Search Tree | Geometric data, range types, nearest-neighbor |
| **hash** | Hash index | Equality-only lookups |

### Guidelines

- Add indexes on fields frequently used in **filters** and **sorts**
- Use **unique indexes** to enforce business uniqueness rules
- Use **partial indexes** (WHERE clause) to index only relevant subsets of data
- Maximum **16 columns** per index

---

## 9. Versions Tab

The **Versions** tab shows the complete **version history** of an entity's schema.

### Version Statuses

| Status | Color | Description |
|---|---|---|
| **Draft** | Blue/Gray | Currently being edited; all changes are made here |
| **Published** | Green | Immutable; actively serving production traffic |
| **Archived** | Gray | Historical; no longer active |

### Version Timeline

Versions are displayed as a vertical **timeline** showing:

- Version number (v1, v2, v3...)
- Custom label (if set)
- Status badge
- Publication date and who published it
- Creation date

### Actions

| Action | Description |
|---|---|
| **Create New Version** | Creates a new draft version (optionally cloned from an existing version) |
| **Publish** | Promotes a draft to published status (triggers compilation and validation) |
| **View Version** | Switch to view a specific historical version |

### Version Workflow

```
Draft → (Edit fields, relations, etc.) → Publish → Published
                                                      ↓
                                                   Archived (when superseded)
```

**Important Rules:**
- Only **one draft version** can exist at a time
- All edits (fields, relations, indexes, etc.) are made against the **draft** version
- Published versions are **immutable** — no changes allowed
- Publishing triggers **compilation** and **cross-entity validation**

---

## 10. Compiled Tab

The **Compiled** tab shows the **compilation dashboard** — a snapshot of the entity's fully resolved schema.

### What is Compilation?

Compilation is the process of:
1. Resolving all fields, relations, indexes, and policies into a single **compiled JSON**
2. Computing a **hash** for change detection
3. Validating cross-entity consistency
4. Generating the runtime schema used by the application

### Compiled Schema Details

| Property | Description |
|---|---|
| **Compiled JSON** | Full resolved schema in JSON format |
| **Compiled Hash** | SHA hash for detecting changes |
| **Generated At** | Timestamp of last compilation |
| **Entity Version** | Which version was compiled |

### When Does Compilation Happen?

- **Manually**: Click "Compile" to trigger recompilation
- **On Publish**: Automatically compiled before publishing
- **On Demand**: API-triggered compilation

---

## 11. Lifecycle Tab

The **Lifecycle** tab defines the **state machine** that governs document workflow progression.

### What is a Lifecycle?

A lifecycle is a finite state machine that defines:
- **States**: The possible statuses a record can be in (e.g., Draft, Submitted, Approved, Rejected)
- **Transitions**: The allowed movements between states (e.g., Draft → Submitted)
- **Terminal States**: States where no further transitions are possible (e.g., Cancelled, Completed)

### Visual Flow Diagram

The lifecycle is rendered as an interactive **flow diagram** (using ReactFlow):
- **State Nodes**: Boxes representing each state
- **Transition Arrows**: Directed lines showing allowed transitions
- **Terminal Indicators**: Special styling for terminal/end states
- **Sort Order**: States are arranged by their defined sort order

### State Properties

| Property | Description |
|---|---|
| **State Name** | Identifier for the state |
| **Is Terminal** | Whether this is an end state (no outgoing transitions) |
| **Sort Order** | Visual ordering of states |

### Transition Properties

| Property | Description |
|---|---|
| **From State** | Source state |
| **To State** | Target state |
| **Operation Code** | Action identifier that triggers this transition |

### Example: Purchase Invoice Lifecycle

```
  Draft → Submitted → Under Review → Approved → Posted
    ↓                     ↓                        ↓
  Cancelled            Rejected                 Reversed
```

---

## 12. Workflows Tab

> **Status: Planned (Epic #7)**

The **Workflows** tab will provide:

- **Approval Workflows**: Multi-stage approval routing
- **Approval Templates**: Reusable approval flow definitions
- **Routing Rules**: Condition-based routing to different approvers
- **Stage Configuration**: Sequential or parallel approval stages

### Approval Template Structure (Preview)

| Component | Description |
|---|---|
| **Template** | Named workflow template linked to an entity |
| **Rules** | Conditions that determine which template applies |
| **Stages** | Sequential approval steps with assigned roles/users |

---

## 13. Policies Tab

The **Policies** tab manages **access control and security** at both entity and field levels.

### Entity-Level Policies

| Policy | Description |
|---|---|
| **Access Mode** | Authorization model: `rbac` (role-based), `abac` (attribute-based), etc. |
| **OU Scope Mode** | Organizational visibility: `tenant`, `organizational_unit`, etc. |
| **Audit Mode** | Audit detail level: `full` (all changes), `minimal` (key events only) |
| **Retention Policy** | Data retention and archival rules |
| **Default Filters** | Auto-applied filters for all queries |
| **Cache Flags** | Caching behavior configuration |

### Field-Level Security Policies

Fine-grained control over individual field access:

| Property | Description |
|---|---|
| **Field Path** | Dot-notation path to the field (e.g., `amount`, `supplier.name`) |
| **Policy Type** | `read` (viewing), `write` (editing), or `both` |
| **Role List** | Comma-separated roles that have access |
| **ABAC Condition** | Attribute-based condition for dynamic access decisions |
| **Mask Strategy** | How to hide restricted data |
| **Scope** | `default` or custom scope identifier |
| **Priority** | Precedence when multiple policies apply (0-9999, lower = higher priority) |
| **Is Active** | Enable or disable this policy |

### Masking Strategies

When a user does not have permission to view a field, the data can be masked:

| Strategy | Description | Example |
|---|---|---|
| **null** | Return null/empty | `null` |
| **redact** | Replace with redaction text | `[REDACTED]` |
| **hash** | Show a hashed value | `a1b2c3d4...` |
| **partial** | Show partial data | `****1234` |
| **remove** | Completely omit the field | Field absent from response |

---

## 14. Validation Tab

The **Validation** tab configures **business rules** that enforce data quality and consistency.

### Validation Rule Editor

Rules are managed through a visual editor with:
- **Rule List**: All configured rules with kind, severity, and status
- **Rule Form Dialog**: Detailed configuration when adding/editing a rule
- **Condition Tree Builder**: Visual builder for complex conditions
- **Validation Test Panel**: Test rules against sample payloads

### Rule Properties

| Property | Description |
|---|---|
| **Name** | Human-readable rule name (max 256 chars) |
| **Kind** | Rule type (see below) |
| **Severity** | `error` (blocks save) or `warning` (informational) |
| **Applies On** | When triggered: `create`, `update`, `transition`, or `all` |
| **Phase** | Execution phase: `beforePersist` (before save) or `beforeTransition` (before state change) |
| **Field Path** | The field this rule validates |
| **Message** | Custom error/warning message (max 1024 chars) |

### Rule Kinds

| Kind | Description | Configurable Properties |
|---|---|---|
| **required** | Field must have a value | — |
| **min_max** | Numeric range check | `min`, `max` |
| **length** | String length check | `minLength`, `maxLength` |
| **regex** | Pattern match | `pattern` |
| **enum** | Value must be in allowed list | `allowedValues` |
| **cross_field** | Compare against another field | `compareField`, `operator` |
| **conditional** | If-then validation | `when` (condition), `then` (rules to apply) |
| **date_range** | Date range validation | `afterField`/`beforeField` or `minDate`/`maxDate` |
| **referential** | Value must exist in another entity | `targetEntity`, `targetField` |
| **unique** | Uniqueness check across records | `scope` (fields defining uniqueness scope) |

### Condition Operators

The following operators are available for cross-field, conditional, and complex rules:

| Category | Operators |
|---|---|
| **Comparison** | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` |
| **Set** | `in`, `not_in`, `between` |
| **String** | `contains`, `not_contains`, `starts_with`, `ends_with`, `matches` |
| **Existence** | `exists`, `not_exists`, `empty`, `not_empty` |
| **Date** | `date_before`, `date_after` |

### Condition Tree Builder

For complex rules, conditions can be nested using **AND/OR groups**:

```
AND
├── invoice_type eq "STANDARD"
├── OR
│   ├── amount gt 10000
│   └── currency eq "USD"
└── supplier_id exists
```

### Testing Validation Rules

Use the **Validation Test Panel** to:
1. Enter a sample JSON payload
2. Click "Test"
3. See which rules pass, fail, or produce warnings
4. Iterate on rules before publishing

---

## 15. Forms Tab

The **Forms** tab provides a **Form Designer** for configuring data entry form layouts.

### Capabilities

| Feature | Description |
|---|---|
| **Field Selection** | Choose which fields appear on the form |
| **Layout Configuration** | Arrange fields in sections, rows, and columns |
| **Field Ordering** | Drag and drop to reorder fields within sections |
| **Section Management** | Group related fields into collapsible sections |
| **Conditional Visibility** | Show/hide fields based on other field values |
| **UI Hints** | Customize field rendering (placeholder text, help tooltips, etc.) |

### Form Design Workflow

1. Select fields from the entity to include
2. Organize fields into logical sections
3. Configure layout (full-width, half-width, etc.)
4. Set conditional visibility rules
5. Preview the form
6. Save the configuration

---

## 16. Views Tab

The **Views** tab provides a **View Configurator** for designing list/grid views.

### Capabilities

| Feature | Description |
|---|---|
| **Column Selection** | Choose which fields appear as columns |
| **Column Ordering** | Drag and drop to reorder columns |
| **Default Sort** | Set the default sort field and direction |
| **Filters** | Configure available filter options |
| **Grouping** | Group records by field values |
| **Aggregations** | Show sum, count, average in column footers |
| **Saved Views** | Create multiple named view configurations |

### View Configuration Workflow

1. Select columns from available fields
2. Set column widths and ordering
3. Configure default sorting and filtering
4. Optionally set grouping and aggregation
5. Save as a named view

---

## 17. Integrations Tab

> **Status: Planned (Epic #10)**

The **Integrations** tab will provide:

- **Integration Mappings**: Map entity fields to external system fields
- **Sync Schedules**: Configure automated data synchronization timing
- **Transformation Rules**: Data transformation between systems
- **Connector Configuration**: Settings for external system connections

---

## 18. Overlays Tab

The **Overlays** tab enables **tenant-specific or context-specific schema modifications** without altering the base entity definition.

### What are Overlays?

Overlays are a powerful mechanism for customization. They allow implementation consultants to:
- Add new fields for a specific tenant
- Remove irrelevant fields
- Modify field properties (labels, validation, defaults)
- Adjust policies or validation rules
- Customize UI behavior

All without creating a separate entity or forking the schema.

### Overlay Properties

| Property | Description |
|---|---|
| **Overlay Key** | Unique identifier (max 128 chars) |
| **Priority** | Execution order (0-9999, lower = applied first) |
| **Conflict Mode** | How to handle conflicts with other overlays |
| **Is Active** | Enable or disable this overlay |
| **Changes** | Array of modifications to apply |

### Conflict Modes

| Mode | Description |
|---|---|
| **fail** | Abort if any conflict is detected |
| **overwrite** | Later overlay wins on conflict |
| **merge** | Attempt to merge conflicting changes |

### Change Types

| Kind | Description | Example |
|---|---|---|
| **addField** | Add a new field to the entity | Add a `local_tax_id` field |
| **removeField** | Remove an existing field | Remove `fax_number` |
| **modifyField** | Change field properties | Make `description` required |
| **tweakPolicy** | Adjust security policies | Restrict `salary` to HR role |
| **overrideValidation** | Change validation rules | Increase `max_amount` limit |
| **overrideUi** | Modify UI behavior | Change field label or help text |

### Overlay Management

- **Drag to Reorder**: Change overlay priority by dragging
- **Toggle Active**: Enable/disable overlays without deleting
- **View Changes**: See the list of modifications each overlay applies

---

## 19. Activity & Audit Trail

Every action in Meta Studio is tracked through the **Activity / Audit Trail** system.

### Accessing the Audit Trail

- Click the **Activity** button in the entity detail header
- Opens a side **drawer** showing chronological events

### Tracked Events

| Event | Description |
|---|---|
| **Entity Created** | New entity was created |
| **Entity Updated** | Entity metadata was modified |
| **Entity Deleted** | Entity was deleted |
| **Field Added** | New field was added |
| **Field Updated** | Field properties were changed |
| **Field Deleted** | Field was removed |
| **Field Reordered** | Field sort order was changed |
| **Relation Added** | New relation was created |
| **Relation Deleted** | Relation was removed |
| **Index Added** | New index was created |
| **Policy Updated** | Security policy was changed |
| **Overlay Saved** | Overlay was created or modified |
| **Version Created** | New version was created |
| **Version Published** | Version was promoted to published |
| **Schema Compiled** | Entity schema was compiled |

### Audit Event Details

Each event records:

| Property | Description |
|---|---|
| **Timestamp** | When the event occurred |
| **User** | Who performed the action |
| **Session ID** | Hashed session identifier |
| **Correlation ID** | Request tracing identifier |
| **Event Type** | The specific audit event |
| **Before/After** | Snapshot of data before and after the change |

### Pagination

- Events are paginated with configurable `limit` and `offset`
- Most recent events are shown first

---

## 20. Publishing & Compilation Workflow

Publishing is the process of promoting a draft schema version to production status.

### Publishing Steps

```
1. Edit schema (fields, relations, etc.) in Draft version
       ↓
2. Click "Publish"
       ↓
3. System runs Validation Checks:
   - All required fields properly configured?
   - Relations reference valid target entities?
   - Indexes reference existing fields?
   - No breaking changes without migration plan?
       ↓
4. System runs Compilation:
   - Resolves all schema components into compiled JSON
   - Generates schema hash for change detection
       ↓
5. Cross-Entity Consistency Check:
   - Validates foreign keys and relations across entities
   - Checks for circular dependencies
       ↓
6. If all checks pass → Version status changes to "Published"
   If any check fails → Returns 422 with detailed errors
```

### Compile vs. Publish

| Operation | Effect |
|---|---|
| **Compile** | Generates compiled snapshot without changing version status; useful for preview |
| **Publish** | Compiles + validates + promotes draft to published status |

### Important Notes

- **Only draft versions** can be published
- Publishing is **irreversible** — published versions cannot be modified
- To make further changes, **create a new draft version**
- Previous published version is **archived** when a new version is published

---

## 21. Bulk Operations

### Bulk Field Import

For large entities, fields can be imported in bulk:

| Property | Description |
|---|---|
| **Maximum** | 100 fields per import |
| **Format** | JSON array of field definitions |
| **Validation** | All fields validated against the create field schema |
| **Atomicity** | All-or-nothing — if any field fails validation, none are imported |

### How to Use

1. Prepare a JSON file with field definitions
2. Use the **Bulk Import Dialog**
3. Review validation results
4. Confirm import

---

## 22. Version Diffing & Impact Analysis

### Schema Diff

Compare two versions of an entity to see exactly what changed:

| Diff Element | Description |
|---|---|
| **Fields Added** | New fields in the target version |
| **Fields Removed** | Fields that were deleted |
| **Fields Modified** | Fields with changed properties |
| **Type Changes** | Data type modifications |
| **Breaking Changes** | Changes that may affect existing data or integrations |

### Breaking Change Detection

The system flags the following as **breaking changes**:

| Change | Why It's Breaking |
|---|---|
| **Field removed** | Existing code/queries referencing this field will fail |
| **Data type changed** | Existing data may not be compatible |
| **Made required** | Existing records without a value will become invalid |

### Impact Analysis

Before publishing, understand the blast radius:
- Which other entities reference this entity?
- Which views and forms will be affected?
- Are there overlays that conflict with the changes?

---

## 23. Change Requests

Change requests provide a **governed workflow** for schema modifications:

| Feature | Description |
|---|---|
| **Request** | Submit a proposed schema change |
| **Review** | Reviewers can approve or reject |
| **Track** | Monitor change request status |
| **Apply** | Approved changes are applied to the draft |

### Deprecation

Entities or fields can be **deprecated** to signal they are planned for removal:
- Sets the `isDeprecated` flag
- Triggers warnings in validation
- Allows gradual migration before removal

---

## 24. System Constraints & Limits

### Naming Rules

| Rule | Constraint |
|---|---|
| Entity names | Lowercase `snake_case`, 1-128 characters |
| Field names | Lowercase `snake_case`, not a reserved name |
| Table schema | 1-63 characters |
| Index names | Lowercase `snake_case` |
| Relation names | Lowercase `snake_case` |

### Quantity Limits

| Item | Maximum |
|---|---|
| Fields per bulk import | 100 |
| Columns per index | 16 |
| Enum values per field | 500 |
| Lookup search fields | 20 |
| Alternate keys per entity | 10 |
| Search aliases per entity | 20 |
| Validation rules per entity | 200 |
| Overlay priority range | 0 - 9999 |
| Field security priority range | 0 - 9999 |
| Field label length | 256 characters |
| Field description length | 2,048 characters |
| Validation message length | 1,024 characters |
| Display template length | 512 characters |
| WHERE clause length | 1,024 characters |
| Request body size | 256 KB |

### Rate Limits

| Operation | Default Limit |
|---|---|
| Read operations | 1,000 requests/minute |
| Write operations | 100 requests/minute |

Exceeding limits returns a **429 Too Many Requests** response with a `Retry-After` header.

### Concurrency Control

- Uses **optimistic concurrency** via ETag headers
- Mutations require the `If-Match` header with the current ETag
- If another user modified the entity since your last read, you receive a **409 Conflict** response
- Resolution: Refresh your data and retry the operation

---

## 25. Glossary

| Term | Definition |
|---|---|
| **Entity** | A data schema definition (analogous to a database table or business object) |
| **Field** | An attribute/property of an entity (analogous to a database column) |
| **Relation** | A defined link between two entities |
| **Index** | A database index for query performance optimization |
| **Version** | A numbered snapshot of an entity's schema definition |
| **Draft** | An editable version of a schema |
| **Published** | An immutable, production-active version of a schema |
| **Compiled Schema** | The fully resolved, runtime-ready representation of an entity |
| **Lifecycle** | A state machine defining the workflow stages of a document |
| **Transition** | An allowed movement between lifecycle states |
| **Policy** | Access control and security rules applied to entities or fields |
| **Overlay** | A tenant/context-specific schema modification layer |
| **Validation Rule** | A business rule that enforces data quality |
| **Form** | A configured data entry layout for an entity |
| **View** | A configured list/grid display for browsing entity records |
| **OU** | Operating Unit — an organizational boundary for data visibility |
| **RBAC** | Role-Based Access Control |
| **ABAC** | Attribute-Based Access Control |
| **ETag** | Entity Tag — a hash used for optimistic concurrency control |
| **BFF** | Backend for Frontend — the API layer serving the admin UI |
| **ERD** | Entity-Relationship Diagram |
| **Snake Case** | Naming convention: `words_separated_by_underscores` |

---

*This document covers the complete functional scope of Meta Studio as of the current codebase. Features marked as "Planned" (Workflows — Epic #7, Integrations — Epic #10) are not yet implemented but are architecturally reserved.*

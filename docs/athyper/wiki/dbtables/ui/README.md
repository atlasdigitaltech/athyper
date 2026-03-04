# UI Schema (`ui`)

The `ui` schema stores user-facing application state: generic preferences, saved list/grid view configurations with scoped visibility, dashboard widget layouts, recently viewed entity tracking, and search history for autocomplete and analytics. All tables are tenant-isolated and keyed to `core.principal` for per-user personalization.

**Source**: `framework/adapters/db/src/sql/120_ui.sql`

---

## Table of Contents

1. [ui.user_preference](#uiuser_preference)
2. [ui.saved_view](#uisaved_view)
3. [ui.dashboard_widget](#uidashboard_widget)
4. [ui.recent_activity](#uirecent_activity)
5. [ui.search_history](#uisearch_history)

---

## ui.user_preference

### Functional Description

Generic key-value preference storage for individual users. Stores any user-configurable setting (theme, locale, density, sidebar state, etc.) as a JSONB value keyed by a string preference key. This table serves as the catch-all for user settings that do not warrant their own dedicated table.

### Technical Details

| Column           | Type        | Nullable | Default             | Description                                                   |
| ---------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------- |
| id               | uuid        | NOT NULL | `gen_random_uuid()` | Unique preference record identifier                           |
| tenant_id        | uuid        | NOT NULL |                     | Owning tenant                                                 |
| principal_id     | uuid        | NOT NULL |                     | User principal this preference belongs to                     |
| preference_key   | text        | NOT NULL |                     | Preference key (e.g., `theme`, `locale`, `sidebar_collapsed`) |
| preference_value | jsonb       | NOT NULL |                     | Preference value (arbitrary JSON)                             |
| created_at       | timestamptz | NOT NULL | `now()`             | When the preference was first created                         |
| created_by       | text        | NOT NULL |                     | Who created the preference                                    |
| updated_at       | timestamptz | YES      |                     | When the preference was last updated                          |
| updated_by       | text        | YES      |                     | Who last updated the preference                               |

### Primary Key

`(id)`

### Foreign Keys

| Constraint | Column       | References         | On Delete |
| ---------- | ------------ | ------------------ | --------- |
| (inline)   | tenant_id    | core.tenant(id)    | CASCADE   |
| (inline)   | principal_id | core.principal(id) | CASCADE   |

### Constraints

| Constraint                         | Type   | Description                                                            |
| ---------------------------------- | ------ | ---------------------------------------------------------------------- |
| user_preference_principal_key_uniq | UNIQUE | One preference per key per principal: `(principal_id, preference_key)` |

### Indexes

| Index                         | Columns        | Condition | Description                               |
| ----------------------------- | -------------- | --------- | ----------------------------------------- |
| idx_user_preference_principal | (principal_id) |           | Fast lookup of all preferences for a user |

### Relationships

- Belongs to `core.tenant`
- Belongs to `core.principal`

---

## ui.saved_view

### Functional Description

Persists saved list/grid view configurations including view mode, column selections, sort orders, filter criteria, and density settings. Views are scoped as SYSTEM (platform defaults), USER (personal), or SHARED (visible to all tenant users). Supports optimistic concurrency via a `version` counter, dirty detection via `state_hash`, and soft deletion via `deleted_at`. The full view state is stored as a JSONB payload in `state_json`.

### Technical Details

| Column        | Type        | Nullable | Default             | Description                                                           |
| ------------- | ----------- | -------- | ------------------- | --------------------------------------------------------------------- |
| id            | uuid        | NOT NULL | `gen_random_uuid()` | Unique saved view identifier                                          |
| tenant_id     | uuid        | NOT NULL |                     | Owning tenant                                                         |
| entity_key    | text        | NOT NULL |                     | Entity type this view applies to (e.g., `batches`, `documents`)       |
| scope         | text        | NOT NULL | `'USER'`            | Visibility scope: `SYSTEM`, `USER`, `SHARED`                          |
| owner_user_id | uuid        | YES      |                     | Owner principal (null for SYSTEM views)                               |
| name          | text        | NOT NULL |                     | Human-readable view name                                              |
| is_pinned     | boolean     | NOT NULL | `false`             | Whether this view is pinned to the navigation                         |
| is_default    | boolean     | NOT NULL | `false`             | Whether this is the default view for the entity                       |
| state_json    | jsonb       | NOT NULL |                     | Full ViewPreset payload (columns, sorts, filters, density, view mode) |
| state_hash    | text        | NOT NULL |                     | Truncated SHA-256 hash of `state_json` for dirty detection            |
| version       | int         | NOT NULL | `1`                 | Optimistic concurrency version counter                                |
| created_at    | timestamptz | NOT NULL | `now()`             | Creation timestamp                                                    |
| created_by    | text        | NOT NULL |                     | Who created the view                                                  |
| updated_at    | timestamptz | YES      |                     | Last update timestamp                                                 |
| updated_by    | text        | YES      |                     | Who last updated the view                                             |
| deleted_at    | timestamptz | YES      |                     | Soft-delete timestamp (null = active)                                 |

### Primary Key

`(id)`

### Foreign Keys

| Constraint | Column        | References         | On Delete |
| ---------- | ------------- | ------------------ | --------- |
| (inline)   | tenant_id     | core.tenant(id)    | CASCADE   |
| (inline)   | owner_user_id | core.principal(id) | CASCADE   |

### Constraints

| Constraint                        | Type                      | Description                                                                                    |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| saved_view_scope_chk              | CHECK                     | scope IN (`SYSTEM`, `USER`, `SHARED`)                                                          |
| saved_view_entity_name_scope_uniq | UNIQUE NULLS NOT DISTINCT | Unique view name per entity+scope+owner: `(tenant_id, entity_key, scope, owner_user_id, name)` |

### Indexes

| Index               | Columns                                | Condition                                     | Description                                |
| ------------------- | -------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| idx_saved_view_list | (tenant_id, entity_key)                | `WHERE deleted_at IS NULL`                    | List active views for an entity            |
| idx_saved_view_user | (tenant_id, owner_user_id, entity_key) | `WHERE deleted_at IS NULL AND scope = 'USER'` | List a user's personal views for an entity |

### Relationships

- Belongs to `core.tenant`
- Optionally belongs to `core.principal` (as owner)

---

## ui.dashboard_widget

### Functional Description

Stores per-user dashboard widget configurations including widget type, display name, grid position (x, y, width, height), data source binding, and custom configuration. Enables users to build personalized dashboards with drag-and-drop widget placement. Each widget can be independently hidden without deletion.

### Technical Details

| Column       | Type        | Nullable | Default                            | Description                                                        |
| ------------ | ----------- | -------- | ---------------------------------- | ------------------------------------------------------------------ |
| id           | uuid        | NOT NULL | `gen_random_uuid()`                | Unique widget identifier                                           |
| tenant_id    | uuid        | NOT NULL |                                    | Owning tenant                                                      |
| principal_id | uuid        | NOT NULL |                                    | User principal who owns this widget placement                      |
| widget_type  | text        | NOT NULL |                                    | Widget type identifier (e.g., `chart`, `table`, `kpi`, `calendar`) |
| widget_name  | text        | YES      |                                    | User-assigned widget name/title                                    |
| description  | text        | YES      |                                    | Widget description                                                 |
| position     | jsonb       | NOT NULL | `{"x": 0, "y": 0, "w": 4, "h": 3}` | Grid position and dimensions                                       |
| config       | jsonb       | YES      |                                    | Widget-specific configuration                                      |
| data_source  | jsonb       | YES      |                                    | Data source binding (API endpoint, query params, etc.)             |
| is_visible   | boolean     | NOT NULL | `true`                             | Whether the widget is currently visible on the dashboard           |
| created_at   | timestamptz | NOT NULL | `now()`                            | Creation timestamp                                                 |
| created_by   | text        | NOT NULL |                                    | Who created the widget                                             |
| updated_at   | timestamptz | YES      |                                    | Last update timestamp                                              |
| updated_by   | text        | YES      |                                    | Who last updated the widget                                        |

### Primary Key

`(id)`

### Foreign Keys

| Constraint | Column       | References         | On Delete |
| ---------- | ------------ | ------------------ | --------- |
| (inline)   | tenant_id    | core.tenant(id)    | CASCADE   |
| (inline)   | principal_id | core.principal(id) | CASCADE   |

### Constraints

None beyond NOT NULL and foreign key constraints.

### Indexes

| Index                          | Columns        | Condition | Description                       |
| ------------------------------ | -------------- | --------- | --------------------------------- |
| idx_dashboard_widget_principal | (principal_id) |           | Load all widgets for a user       |
| idx_dashboard_widget_type      | (widget_type)  |           | Find widgets by type across users |

### Relationships

- Belongs to `core.tenant`
- Belongs to `core.principal`

---

## ui.recent_activity

### Functional Description

Tracks recently viewed or accessed entities per user, powering the "Recent Items" quick-access panel. Each row records the entity type, entity ID, a display-friendly entity name, the action performed (default: `view`), and the access timestamp. Supports rich metadata for context (e.g., which page was viewed, referrer context). Ordered by `accessed_at` descending for chronological display.

### Technical Details

| Column       | Type        | Nullable | Default             | Description                                                     |
| ------------ | ----------- | -------- | ------------------- | --------------------------------------------------------------- |
| id           | uuid        | NOT NULL | `gen_random_uuid()` | Unique activity record identifier                               |
| tenant_id    | uuid        | NOT NULL |                     | Owning tenant                                                   |
| principal_id | uuid        | NOT NULL |                     | User principal who performed the action                         |
| entity_type  | text        | NOT NULL |                     | Type of entity accessed (e.g., `batch`, `document`, `supplier`) |
| entity_id    | uuid        | NOT NULL |                     | ID of the entity accessed                                       |
| entity_name  | text        | YES      |                     | Display name of the entity (denormalized for fast rendering)    |
| action       | text        | NOT NULL | `'view'`            | Action performed on the entity                                  |
| accessed_at  | timestamptz | NOT NULL | `now()`             | When the entity was accessed                                    |
| metadata     | jsonb       | YES      |                     | Extensible metadata (page context, referrer, etc.)              |
| created_at   | timestamptz | NOT NULL | `now()`             | Record creation timestamp                                       |

### Primary Key

`(id)`

### Foreign Keys

| Constraint | Column       | References         | On Delete |
| ---------- | ------------ | ------------------ | --------- |
| (inline)   | tenant_id    | core.tenant(id)    | CASCADE   |
| (inline)   | principal_id | core.principal(id) | CASCADE   |

### Constraints

None beyond NOT NULL and foreign key constraints.

### Indexes

| Index                              | Columns                             | Condition | Description                                            |
| ---------------------------------- | ----------------------------------- | --------- | ------------------------------------------------------ |
| idx_recent_activity_principal_time | (principal_id, accessed_at DESC)    |           | User's recent activity feed, newest first              |
| idx_recent_activity_entity         | (tenant_id, entity_type, entity_id) |           | Find all users who recently accessed a specific entity |

### Relationships

- Belongs to `core.tenant`
- Belongs to `core.principal`
- Logically references a business entity via `entity_type` + `entity_id`

---

## ui.search_history

### Functional Description

Records user search queries for powering search autocomplete suggestions and search analytics. Captures the search text, optional entity type filter, result count, and timestamp. Used to improve user experience by suggesting previously used queries and to provide product analytics on what users are searching for.

### Technical Details

| Column       | Type        | Nullable | Default             | Description                                  |
| ------------ | ----------- | -------- | ------------------- | -------------------------------------------- |
| id           | uuid        | NOT NULL | `gen_random_uuid()` | Unique search history record identifier      |
| tenant_id    | uuid        | NOT NULL |                     | Owning tenant                                |
| principal_id | uuid        | NOT NULL |                     | User principal who performed the search      |
| query_text   | text        | NOT NULL |                     | The search query string                      |
| entity_type  | text        | YES      |                     | Entity type filter applied during the search |
| result_count | int         | YES      |                     | Number of results returned                   |
| searched_at  | timestamptz | NOT NULL | `now()`             | When the search was performed                |
| created_at   | timestamptz | NOT NULL | `now()`             | Record creation timestamp                    |

### Primary Key

`(id)`

### Foreign Keys

| Constraint | Column       | References         | On Delete |
| ---------- | ------------ | ------------------ | --------- |
| (inline)   | tenant_id    | core.tenant(id)    | CASCADE   |
| (inline)   | principal_id | core.principal(id) | CASCADE   |

### Constraints

None beyond NOT NULL and foreign key constraints.

### Indexes

| Index                             | Columns                          | Condition | Description                                               |
| --------------------------------- | -------------------------------- | --------- | --------------------------------------------------------- |
| idx_search_history_principal_time | (principal_id, searched_at DESC) |           | User's search history, newest first (autocomplete source) |

### Relationships

- Belongs to `core.tenant`
- Belongs to `core.principal`

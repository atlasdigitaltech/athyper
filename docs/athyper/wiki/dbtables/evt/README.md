# Event Store Schema (`evt`)

The `evt` schema implements the event sourcing backbone for the Athyper platform. It provides an append-only, immutable event log partitioned by month, projection infrastructure (snapshots, registry, checkpoints), and monotonic sequence generation per aggregate partition. The event store is the single source of truth for all state transitions across financial engines.

**Source**: `framework/adapters/db/src/sql/150_event_store.sql`

---

## Table of Contents

1. [evt.event](#evtevent)
2. [evt.event_snapshot](#evtevent_snapshot)
3. [evt.projection_registry](#evtprojection_registry)
4. [evt.projection_checkpoint](#evtprojection_checkpoint)
5. [evt.sequence_counter](#evtsequence_counter)

---

## evt.event

### Functional Description

The universal event store -- an append-only, immutable log of all domain events across the platform. Each event records a state transition for a specific transaction/document, carrying a full payload with cryptographic hash for integrity verification. Events are keyed by partition domain and partition key (forming a logical aggregate stream) with monotonic sequence numbers for ordering guarantees. An immutability trigger prevents any UPDATE or DELETE operations. The table is **range-partitioned by month** on `created_at`.

### Technical Details

| Column           | Type         | Nullable | Default             | Description                                                                                                       |
| ---------------- | ------------ | -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| id               | uuid         | NOT NULL | `gen_random_uuid()` | Unique event identifier                                                                                           |
| event_type       | varchar(100) | NOT NULL |                     | Event type code (e.g., `COMMITMENT_CREATED`, `POSTING_COMPLETED`)                                                 |
| event_version    | varchar(20)  | NOT NULL | `'v2.1'`            | Schema version of the event payload                                                                               |
| created_at       | timestamptz  | NOT NULL | `now()`             | Event timestamp (partition key)                                                                                   |
| source_engine    | varchar(50)  | NOT NULL |                     | Engine that produced this event (e.g., `budget`, `commitment`, `posting`)                                         |
| txn_id           | uuid         | NOT NULL |                     | Transaction identifier this event belongs to                                                                      |
| doc_id           | uuid         | NOT NULL |                     | Document identifier this event relates to                                                                         |
| doc_type         | varchar(20)  | NOT NULL |                     | Document type: `PR`, `PO`, `INVOICE`, `PAYMENT`, `CREDIT`, `ACCRUAL`, `RECLASS`, `CONTRACT`, `GRN`, `JE`, `OTHER` |
| correlation_id   | uuid         | NOT NULL |                     | Correlation ID for distributed tracing                                                                            |
| causation_id     | uuid         | YES      |                     | ID of the event that caused this event (event chaining)                                                           |
| actor_type       | varchar(20)  | NOT NULL |                     | Who triggered the event: `USER`, `SYSTEM`, `AI_AGENT`, `SCHEDULER`                                                |
| actor_id         | uuid         | NOT NULL |                     | Identifier of the actor                                                                                           |
| tenant_id        | uuid         | NOT NULL |                     | Owning tenant                                                                                                     |
| entity_code      | varchar(20)  | YES      |                     | Legal entity code                                                                                                 |
| ou_id            | uuid         | YES      |                     | Operating unit ID                                                                                                 |
| payload          | jsonb        | NOT NULL | `'{}'`              | Event payload (domain-specific data)                                                                              |
| payload_hash     | varchar(64)  | NOT NULL |                     | SHA-256 hash of the payload for integrity verification                                                            |
| metadata         | jsonb        | YES      | `'{}'`              | Extensible metadata (timing, environment, version info)                                                           |
| partition_domain | varchar(30)  | NOT NULL |                     | Aggregate partition domain (e.g., `budget`, `commitment`)                                                         |
| partition_key    | varchar(200) | NOT NULL |                     | Aggregate partition key (e.g., the specific budget or commitment ID)                                              |
| sequence_no      | bigint       | NOT NULL |                     | Monotonically increasing sequence within the partition                                                            |
| idempotency_key  | varchar(200) | YES      |                     | Idempotency key to prevent duplicate event emission                                                               |

### Primary Key

`(id, created_at)` -- composite key includes partition column.

### Foreign Keys

None declared (event store is self-contained; references are logical).

### Constraints

| Constraint | Type  | Description                                                                                                        |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| (inline)   | CHECK | `doc_type` IN (`PR`, `PO`, `INVOICE`, `PAYMENT`, `CREDIT`, `ACCRUAL`, `RECLASS`, `CONTRACT`, `GRN`, `JE`, `OTHER`) |
| (inline)   | CHECK | `actor_type` IN (`USER`, `SYSTEM`, `AI_AGENT`, `SCHEDULER`)                                                        |

### Indexes

| Index                          | Columns                                                               | Condition                                   | Description                                         |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| idx_evt_event_tenant_partition | (tenant_id, partition_domain, partition_key, sequence_no)             |                                             | Stream replay: read events for a specific aggregate |
| uidx_evt_event_partition_seq   | (tenant_id, partition_domain, partition_key, sequence_no, created_at) | UNIQUE                                      | Guarantee sequence uniqueness within a partition    |
| idx_evt_event_txn              | (tenant_id, txn_id)                                                   |                                             | Find all events for a transaction                   |
| idx_evt_event_type             | (tenant_id, event_type)                                               |                                             | Find events by type                                 |
| idx_evt_event_correlation      | (tenant_id, correlation_id)                                           |                                             | Distributed trace lookup                            |
| idx_evt_event_doc              | (tenant_id, doc_id)                                                   |                                             | Find events for a document                          |
| uidx_evt_event_idempotency     | (tenant_id, idempotency_key, created_at)                              | UNIQUE, `WHERE idempotency_key IS NOT NULL` | Prevent duplicate events via idempotency key        |

### Partitioning

Range-partitioned by `created_at` on monthly boundaries. Initial provisioning creates the current month plus 3 months forward. Partition naming convention: `evt_event_YYYY_MM`.

### Immutability Trigger

The trigger `trg_evt_event_immutable` fires BEFORE UPDATE or DELETE on every row, raising an exception: `'Event store is append-only. UPDATE and DELETE are prohibited.'` This is implemented via the function `evt.prevent_event_mutation()`.

### Relationships

- Logically belongs to `core.tenant` (no FK to preserve event store independence)
- Logically references transactions, documents, and actors

---

## evt.event_snapshot

### Functional Description

Stores point-in-time snapshots of projection state for performance optimization. Instead of replaying all events from the beginning of a partition stream, consumers can load the latest snapshot and replay only events after the snapshot's `last_sequence_no`. Each snapshot includes the serialized projection state and a checksum for integrity verification.

### Technical Details

| Column           | Type         | Nullable | Default             | Description                                         |
| ---------------- | ------------ | -------- | ------------------- | --------------------------------------------------- |
| id               | uuid         | NOT NULL | `gen_random_uuid()` | Unique snapshot identifier                          |
| projection_id    | varchar(100) | NOT NULL |                     | Identifier of the projection this snapshot is for   |
| partition_domain | varchar(30)  | NOT NULL |                     | Aggregate partition domain                          |
| partition_key    | varchar(200) | NOT NULL |                     | Aggregate partition key                             |
| last_sequence_no | bigint       | NOT NULL |                     | Sequence number up to which this snapshot is valid  |
| state_checksum   | varchar(64)  | NOT NULL |                     | SHA-256 checksum of the snapshot data for integrity |
| snapshot_data    | jsonb        | NOT NULL |                     | Serialized projection state                         |
| created_at       | timestamptz  | NOT NULL | `now()`             | When the snapshot was taken                         |
| tenant_id        | uuid         | NOT NULL |                     | Owning tenant                                       |

### Primary Key

`(id)`

### Foreign Keys

None declared.

### Constraints

None beyond NOT NULL constraints.

### Indexes

| Index                       | Columns                                                     | Condition | Description                                            |
| --------------------------- | ----------------------------------------------------------- | --------- | ------------------------------------------------------ |
| idx_evt_snapshot_projection | (tenant_id, projection_id, partition_domain, partition_key) |           | Find snapshots for a specific projection and aggregate |

### Relationships

- Logically belongs to `core.tenant`
- Logically associated with `evt.event` streams via partition_domain + partition_key
- Logically associated with `evt.projection_registry` via projection_id

---

## evt.projection_registry

### Functional Description

Formal registration of all event projections (read-model builders) in the system. Each projection declares which event types it consumes, which partition domains it operates on, its checkpoint and rebuild strategies, consistency model, and data retention policy. This registry enables automated projection management including health monitoring, version tracking, and rebuild orchestration.

### Technical Details

| Column              | Type         | Nullable | Default                  | Description                                                  |
| ------------------- | ------------ | -------- | ------------------------ | ------------------------------------------------------------ |
| id                  | uuid         | NOT NULL | `gen_random_uuid()`      | Unique registry entry identifier                             |
| projection_id       | varchar(100) | NOT NULL |                          | Logical projection identifier                                |
| owning_engine       | varchar(50)  | NOT NULL |                          | Engine that owns this projection (e.g., `budget`, `posting`) |
| projection_version  | varchar(20)  | NOT NULL |                          | Current version of the projection logic                      |
| source_event_types  | text[]       | NOT NULL |                          | Array of event types this projection consumes                |
| partition_domains   | text[]       | NOT NULL |                          | Array of partition domains this projection operates on       |
| checkpoint_strategy | varchar(20)  | NOT NULL | `'SEQUENCE_NO'`          | How checkpoints are maintained                               |
| rebuild_strategy    | varchar(30)  | NOT NULL | `'SNAPSHOT_AND_CATCHUP'` | How to rebuild the projection from scratch                   |
| snapshot_interval   | integer      | YES      |                          | How many events between automatic snapshots                  |
| consistency_model   | varchar(30)  | NOT NULL | `'BOUNDED_STALENESS'`    | Consistency guarantee: e.g., `BOUNDED_STALENESS`, `EVENTUAL` |
| data_retention      | varchar(50)  | NOT NULL | `'INHERIT_EVENT_STORE'`  | Data retention policy for this projection                    |
| is_active           | boolean      | NOT NULL | `true`                   | Whether this projection is currently active                  |
| created_at          | timestamptz  | NOT NULL | `now()`                  | Registration timestamp                                       |
| updated_at          | timestamptz  | NOT NULL | `now()`                  | Last update timestamp                                        |
| tenant_id           | uuid         | NOT NULL |                          | Owning tenant                                                |

### Primary Key

`(id)`

### Foreign Keys

None declared.

### Constraints

| Constraint           | Type   | Description                                                |
| -------------------- | ------ | ---------------------------------------------------------- |
| uq_evt_projection_id | UNIQUE | Unique projection per tenant: `(tenant_id, projection_id)` |

### Indexes

None beyond the unique constraint index.

### Relationships

- Logically belongs to `core.tenant`
- Referenced by `evt.event_snapshot` and `evt.projection_checkpoint` via `projection_id`

---

## evt.projection_checkpoint

### Functional Description

Tracks the last-processed event for each projection per aggregate partition, enabling consumers to resume from where they left off after restarts. Each checkpoint records the last event ID and sequence number, allowing projections to catch up by replaying only events after their checkpoint position. Also used for replay orchestration -- resetting a checkpoint triggers a full or partial rebuild.

### Technical Details

| Column           | Type         | Nullable | Default             | Description                                 |
| ---------------- | ------------ | -------- | ------------------- | ------------------------------------------- |
| id               | uuid         | NOT NULL | `gen_random_uuid()` | Unique checkpoint identifier                |
| projection_id    | varchar(100) | NOT NULL |                     | Projection this checkpoint belongs to       |
| partition_domain | varchar(30)  | NOT NULL |                     | Aggregate partition domain                  |
| partition_key    | varchar(200) | NOT NULL |                     | Aggregate partition key                     |
| last_event_id    | uuid         | NOT NULL |                     | ID of the last processed event              |
| last_sequence_no | bigint       | NOT NULL |                     | Sequence number of the last processed event |
| updated_at       | timestamptz  | NOT NULL | `now()`             | When this checkpoint was last updated       |
| tenant_id        | uuid         | NOT NULL |                     | Owning tenant                               |

### Primary Key

`(id)`

### Foreign Keys

None declared.

### Constraints

| Constraint        | Type   | Description                                                                                                |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| uq_evt_checkpoint | UNIQUE | One checkpoint per projection per partition: `(tenant_id, projection_id, partition_domain, partition_key)` |

### Indexes

None beyond the unique constraint index.

### Relationships

- Logically belongs to `core.tenant`
- Logically associated with `evt.projection_registry` via `projection_id`
- References `evt.event` via `last_event_id` (logical, no FK)

---

## evt.sequence_counter

### Functional Description

Monotonic sequence generator for event streams. Each row maintains the current sequence counter for a specific tenant + partition domain + partition key combination. The companion function `evt.next_sequence()` atomically increments the counter using INSERT ... ON CONFLICT DO UPDATE (upsert), guaranteeing gap-free, strictly increasing sequence numbers within each partition stream. This is critical for event ordering and optimistic concurrency in the event store.

### Technical Details

| Column           | Type         | Nullable | Default | Description                               |
| ---------------- | ------------ | -------- | ------- | ----------------------------------------- |
| tenant_id        | uuid         | NOT NULL |         | Owning tenant                             |
| partition_domain | varchar(30)  | NOT NULL |         | Aggregate partition domain                |
| partition_key    | varchar(200) | NOT NULL |         | Aggregate partition key                   |
| current_seq      | bigint       | NOT NULL | `0`     | Current sequence value for this partition |

### Primary Key

`(tenant_id, partition_domain, partition_key)` -- composite natural key.

### Foreign Keys

None declared.

### Constraints

None beyond the primary key.

### Indexes

The primary key itself serves as the only index required (exact-match lookups during sequence generation).

### Associated Function

**`evt.next_sequence(p_tenant_id uuid, p_partition_domain varchar(30), p_partition_key varchar(200)) RETURNS bigint`**

Atomically generates the next sequence number for a partition stream. Uses `INSERT ... ON CONFLICT DO UPDATE` to handle both first-time initialization (insert with value 1) and subsequent increments (current_seq + 1). Returns the new sequence value. This function should be called within the same transaction as the event INSERT to guarantee consistency.

### Relationships

- Logically belongs to `core.tenant`
- Used by event producers to obtain sequence numbers before inserting into `evt.event`

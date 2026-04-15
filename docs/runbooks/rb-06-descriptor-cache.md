# RB-06 — Descriptor Cache Invalidation

**System:** META — Redis in-process cache / `snapshot.entity_compiled` / `EntityCompilerService`  
**Severity:** P2 — stale descriptors cause incorrect field rendering and validation; no data loss  
**Owner:** Platform Engineering  
**Status:** Final — ops-validated Sprint 44 (44-11)  
**Last reviewed:** 2026-04-15

---

## 1. System Overview

The **entity descriptor** is a compiled snapshot of an entity's schema: fields, types, permissions,
display labels. It is computed from `control.entity` + `control.entity_version` + `control.entity_field`.
Because this is read on every record load, it is cached in three layers:

1. **Redis cache** (optional, recommended in production) — two Redis keys per entity per tenant:
   - **Pointer key** `desc:v2:{tenantId}:{entityCode}:ptr` — stores the current `compiledHash`; deleting this key is sufficient to invalidate without knowing the hash.
   - **Payload key** `desc:v2:{tenantId}:{entityCode}:{versionHash}` — content-addressed JSON blob; expires naturally after TTL.
2. **In-process cache** — a `Map<string, CompiledEntity>` inside `EntityCompilerService` with a 5-minute TTL.
3. **Warm-start snapshot** — a row in `snapshot.entity_compiled`, used to seed the in-process cache on pod restart without a cold-compile round-trip.

### Key components

| Component | Value |
|-----------|-------|
| Compiler class | `EntityCompilerService` (`server/src/foundation/metadata/entity-compiler.service.ts`) |
| Cache interface | `DescriptorCache` in `compiled-entity.route.ts` (backed by Redis) |
| Cache TTL | 300 s (5 min) — `DESCRIPTOR_CACHE_TTL_S` |
| Redis pointer key | `desc:v2:{tenantId}:{entityCode}:ptr` |
| Redis payload key | `desc:v2:{tenantId}:{entityCode}:{versionHash}` |
| In-process cache key | `{tenantId}:{entityCode}` in the in-process Map |
| DB source tables | `control.entity`, `control.entity_version`, `control.entity_field`, `control.entity_class_profile` |
| Warm-start table | `snapshot.entity_compiled` |
| Compiled route | `GET /api/metadata/entities/:entity/compiled` |
| Invalidation function | `invalidateDescriptorCache(cache, tenantId, entityCode)` — deletes pointer key |
| Invalidation trigger | DB trigger `trg_template_child_changed` (fires on entity field / class profile changes) |

### Cache content-addressing

The payload key is content-addressed by `compiledHash` (a hash of the entity version + field set). If the DB content changes:
- The hash changes → old pointer entry becomes stale → cache miss on next read → fresh compile
- Old payload keys expire after the 5-min TTL (no explicit DEL needed)
- Deleting only the **pointer key** is sufficient to force an immediate recompile

---

## 2. When to Invalidate

Stale descriptors manifest as:

| Symptom | Likely Cause |
|---------|-------------|
| Field added in Metadata Studio not appearing in entity forms | In-process cache serving old descriptor (TTL not yet expired) |
| Removed field still rendered (even read-only) | Same — stale cache |
| Wrong field label or type shown | Cache not yet expired after metadata edit |
| New required field not validated | Stale descriptor missing the field's `is_required` flag |
| Permission change not taking effect on field visibility | `read_permission`/`write_permission` change not yet propagated |

In all cases, the issue **self-heals within 5 minutes** (cache TTL). Manual invalidation is only needed when:
- The 5-minute window is unacceptable (e.g. production incident, go-live deployment)
- A pod is mis-serving stale data after a restart (bad warm-start snapshot)

---

## 3. Force-Flush the Cache

### 3.1 Invalidate Redis pointer key for one entity (preferred — takes effect immediately across all pods)

Deleting the pointer key forces every pod to treat its next request as a cache miss and recompile from DB.

```bash
# Using redis-cli (connect to the Redis instance used by athyper-api)
redis-cli DEL "desc:v2:{tenantId}:{entityCode}:ptr"

# Or via a script — invalidate all entities for a tenant
redis-cli KEYS "desc:v2:{tenantId}:*:ptr" | xargs redis-cli DEL
```

After deletion, the next `GET /api/metadata/entities/{entityCode}/compiled` request compiles fresh and writes new Redis keys.

> The old payload key (`desc:v2:{tenantId}:{entityCode}:{oldHash}`) does NOT need to be deleted — it will expire after its 5-min TTL. The new compile writes a new hash-addressed payload key.

### 3.2 Flush all descriptor keys for a tenant

```bash
# Nuclear option — flushes ALL cached descriptors for a tenant
redis-cli KEYS "desc:v2:{tenantId}:*" | xargs redis-cli DEL
```

Use this after a bulk entity schema migration to ensure no pod serves stale descriptors.

### 3.3 Pod rolling restart (also clears in-process cache)

The rolling restart clears the **in-process** Map cache on every pod. Because Redis keys also expire after 5 min, this guarantees a fully fresh start:

```bash
kubectl rollout restart deployment/athyper-api
```

Each pod on startup:
1. Reads `snapshot.entity_compiled` to warm the in-process cache.
2. On first request per entity, writes fresh Redis pointer + payload keys.

The cache is fully fresh within ~30 seconds.

### 3.4 Single-entity invalidation via the compiled endpoint (in-process only)

Calling the compiled endpoint bypasses the in-process cache but still reads from Redis first.
To bypass both, delete the Redis pointer key first (§3.1), then call:

```bash
GET /api/metadata/entities/{entityCode}/compiled
Authorization: Bearer {ops_token}
```

This returns fresh data and re-populates both Redis and the in-process cache on the responding pod.

### 3.5 Programmatic invalidation (application code)

The `invalidateDescriptorCache` function in `compiled-entity.route.ts` deletes the pointer key:

```ts
import { invalidateDescriptorCache } from './routes/compiled-entity.route';

// Invalidate one entity
await invalidateDescriptorCache(cache, tenantId, 'journal_entry');
```

Call this from any service that modifies entity schema (field add/remove, version publish) to ensure
the next request gets a fresh compile.

---

## 4. Verifying Recompilation

### 4.1 Check the warm-start snapshot table

```sql
-- Confirm snapshot was recently updated for an entity
SELECT
  entity_code,
  schema_version,
  compiled_at,
  jsonb_array_length(payload->'fields') AS field_count
FROM snapshot.entity_compiled
WHERE tenant_id    = :tenant_id
  AND entity_code  = :entity_code
ORDER BY compiled_at DESC
LIMIT 1;
```

`compiled_at` should be after your invalidation action. `field_count` should match the expected number of fields in `control.entity_field`.

### 4.2 Verify compiled output via API

```bash
GET /api/metadata/entities/{entityCode}/compiled
Authorization: Bearer {ops_token}
```

Inspect:
- `compiledAt` — should be recent
- `fields` array — should contain the expected fields
- `versionId` — should match the current row in `control.entity_version`

Cross-check against DB:

```sql
SELECT ev.id AS version_id, ev.version_no, ev.status
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.name = :entity_code
  AND ev.status = 'EFFECTIVE'
  AND e.tenant_id = :tenant_id;
```

The `versionId` in the API response should match `version_id` from this query.

### 4.3 Verify field count matches source

```sql
-- Count active fields in the source
SELECT COUNT(*)
FROM control.entity_field ef
JOIN control.entity_version ev ON ev.id = ef.entity_version_id
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.name       = :entity_code
  AND ev.status    = 'EFFECTIVE'
  AND e.tenant_id  = :tenant_id;
```

This count should match `fields.length` in the compiled API response.

---

## 5. Recovery: Corrupt or Missing Warm-Start Snapshot

If `snapshot.entity_compiled` has a corrupt or missing row for an entity (e.g. after a failed migration):

### 5.1 Delete the stale snapshot row

```sql
DELETE FROM snapshot.entity_compiled
WHERE tenant_id  = :tenant_id
  AND entity_code = :entity_code;
```

### 5.2 Force a fresh compile

```bash
GET /api/metadata/entities/{entityCode}/compiled
Authorization: Bearer {ops_token}
Cache-Control: no-cache
```

The compiler will:
1. Find no snapshot (row deleted)
2. Fall through to full compile from `control.*` tables
3. Write a fresh snapshot row
4. Return the compiled descriptor

Verify with §4.1 that `compiled_at` is now current.

### 5.3 Rebuild all entity snapshots (full refresh)

If multiple entities are affected (e.g. after a schema migration), trigger a full refresh by calling the compiled endpoint for each entity. Or run a pod rolling restart (§3.1) which causes each entity to recompile on first access.

---

## 6. DB Trigger Reference

The invalidation trigger (`trg_template_child_changed`) fires on `INSERT`, `UPDATE`, and `DELETE`
to `control.entity_field` and `control.entity_class_profile`. It updates
`control.entity.schema_version` (incrementing an integer counter), which changes the compile hash
and makes the in-process cache entry stale on next access.

Verify the trigger exists:

```sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_template_child_changed';
```

If the trigger is disabled or missing, field changes will not auto-invalidate the cache. Re-enable:

```sql
ALTER TABLE control.entity_field
  ENABLE TRIGGER trg_template_child_changed;

ALTER TABLE control.entity_class_profile
  ENABLE TRIGGER trg_template_child_changed;
```

---

## 7. Escalation

| Condition | Action |
|-----------|--------|
| Cache does not self-heal after 5 min + rolling restart + Redis flush | Suspect trigger disabled; run §6 trigger check |
| `snapshot.entity_compiled.compiled_at` is months old | Row was never replaced (snapshot is immutable — see trigger `trg_ec_immutable`); run §5.1 delete + §5.2 fresh compile |
| Compiled `fields` array empty but source has fields | Check `ev.status = 'EFFECTIVE'` — entity may have no effective version |
| `GET /compiled` returns 404 for a known entity | Entity may be soft-deleted in `control.entity`; check `is_deleted` / `status` column |
| Redis unavailable | Descriptor cache degrades gracefully to in-process + DB snapshot only; no data loss, but compile latency increases |

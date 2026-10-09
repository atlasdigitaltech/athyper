# Country / State Region — sequencing check

**Assessment only • 8 October 2026.** Status check on the Meta Entity cleanup for
Country and State Region, expressed in the **existing milestone and step vocabulary**
already used by the qualification runbook, the Board blueprint (§12.1) and the Calendar
blueprint. Not design authority, not a plan, not a qualification record, and it
proposes no new sequencing.

Evidence: repository inspection at HEAD `74992697f` (8 Oct 21:51) and read-only DEV
queries. No deployed behaviour was verified.

---

## 1. Position in the existing plan

Everything currently queued sits behind one point in the runbook's milestone table:

```
M1 — governed bootstrap/product writes        ✅ executed (DEV command authority installed)
P  — parallel preparation                     in progress
M2 — canonical enrollment                     ~complete  ◀── was the blocker
M3 — native conversion + compiler/reader      NOT STARTED ◀── this is the gate
M4 — publish host + deployed reads            not started
```

**What waits on M3** (all using the blueprints' own words):

| Waiting item                                                                                           | Source        | Their condition                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------- |
| Board **step C** (0b-ii identity scan + fallback removal)                                              | Board §12.1   | "the identity scan is only meaningful on cleaned metadata"           |
| Board **step D** (reference members, guards, forward upgrade, compiler, generators, Studio dictionary) | Board §12.1   | "same package, DDL folder, generators and Studio blueprint"          |
| Board **decision 14.8** (shared-reference list modes + per-field flags)                                | Board §14     | "waits behind the metadata-cleanup gate with step D"                 |
| Calendar **C-authoring** (§5.2–5.4)                                                                    | Calendar §13  | "waits behind the same gate as Board step D"                         |
| Calendar **component catalogue row** declaring `calendar`                                              | Calendar §5.4 | "lands with the Calendar authoring step, after the metadata cleanup" |
| Board **step E** (first real pilot)                                                                    | Board §12.1   | "Depends on C, D and native list activation"                         |
| Board **step F** (Phase 1b)                                                                            | Board §13     | composer host chain                                                  |

---

## 2. Milestone check against their own exit criteria

| Milestone | Exit criterion (verbatim)                                                                                                                                                                                                            | Measured                                                                                           | Verdict           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------- |
| **M2**    | "Both actual drafts have canonical owned labels, validated field identities **and source provenance**; revision/conflict/replay/rollback and original-history preservation pass"                                                     | labels **63** · field identities **31** · **source provenance present** · drafts at **revision 4** | **~Met** (see §3) |
| **M3**    | "Both actual graphs convert atomically; exact native readback, immutable pre/post history, whole-release compile and reader compatibility pass. **Pending cutover constraints change only through the qualified forward migration**" | 6 remaining blanket constraints · `layout_config` **102/102** · native list modes **0**            | **Not started**   |
| **M4**    | installed F6/F8 resources, F9 mappings, signed publication/activation, deployed positive/negative tests                                                                                                                              | F6/F8/F9 not established                                                                           | Not started       |

---

## 3. What advanced — and a correction to earlier reporting

**M2's remaining condition has landed.** I previously reported source ownership as the
top functional blocker with both drafts at NULL source kind. That is now **outdated**:

| Evidence              | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Both reference drafts | `source_kind = 'product'`, `publication_owner='platform'`, `revision = 4`                         |
| Migration             | `20261008_entity_legacy_ownership_initialization.sql` — **applied** in DEV `2026-10-07 19:20:28Z` |
| Guard                 | `metadata.guard_legacy_ownership_initialization()` installed with a one-time semantics trigger    |
| Labels / identities   | 63 / 31 (unchanged, still correct)                                                                |

**Correction I owe:** I twice reported "7 pending cutover constraints — unchanged" as
evidence the gate had not moved. The **count** is unchanged, but that was incomplete.
`entity_change_set_native_pending_ck` has been **narrowed**, not left alone:

```sql
-- now admits a product-ownership branch while still forbidding the other native markers
CHECK (... native_core_layout_version IS NULL AND entity_label_id IS NULL
       AND publication_resource_key IS NULL AND source_uri IS NULL
       AND source_predecessor_release_id IS NULL
  AND ((source_kind IS NULL AND schema_version IS NULL AND ... )
    OR ((source_kind='product' AND tenant_id IS NULL AND publication_owner='platform'
         AND schema_version>0 AND authoring_schema_hash ~ '^[a-f0-9]{64}$'
         AND source_hash ~ '^[a-f0-9]{64}$') IS TRUE)))
```

**This is a per-property gate release**, and it is the correct pattern — the guard
verifies the predecessor constraint definition by exact text before dropping it, so the
cutover cannot silently drift. I previously recommended this approach for M3; it is
already in use here.

---

## 4. M3 — the remaining gate, measured

Six blanket constraints still hold their typed columns NULL:

| Constraint                                       | Holds NULL                    |
| ------------------------------------------------ | ----------------------------- |
| `entity_field_native_pending_ck`                 | field core columns            |
| `entity_runtime_profile_native_pending_ck`       | runtime profile columns       |
| `entity_surface_native_pending_ck`               | surface identity/mode columns |
| `entity_surface_section_native_pending_ck`       | section columns               |
| `entity_surface_field_binding_native_pending_ck` | binding columns               |
| `entity_operation_native_pending_ck`             | operation columns             |

And the two measures that show the cutover itself has not begun:

```
entity_surface.layout_config present   = 102 / 102   (100%)
entity_surface.supported_modes non-null = 0
```

**M3's exit criterion is explicit that these change "only through the qualified forward
migration."** No such migration has landed since the `20261007_*_preparation` set.

---

## 5. Findings that fit the existing sequence

| #   | Finding                                                                                                                                                                                                                                                                                                    | Fits where                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | **The ownership release proves the per-property pattern works.** Six constraints remain; applying the same narrow-in-one-migration approach covers M3 without a second convention                                                                                                                          | **M3**                                                   |
| 2   | **16 RLS read policies exclude product-baseline rows** — including `entity_label`, `entity_label_translation`, `entity_field_identity`, `entity_field_access`, `entity_surface_view`. `tenant_read` is `tenant_id = current_tenant_id_soft()` with no `tenant_id IS NULL` clause; `NULL = NULL` → excluded | **Before M3** — M3 writes and reads exactly these tables |
| 3   | **`entity_label_translation` = 0** while Country declares `en/ms/ar`                                                                                                                                                                                                                                       | **M2 tail**                                              |
| 4   | **`entity_target` = 0** — delivery is not declaration-driven                                                                                                                                                                                                                                               | **M3/M4**                                                |
| 5   | One unformatted file (`server/db/migrations/inventory.json`); 32 files uncommitted                                                                                                                                                                                                                         | housekeeping                                             |

**On finding 2 — why it matters for this sequence specifically.** The failure mode is
silent emptiness, not denial: the composer reads zero rows and reports "nothing
enrolled yet" **while 63 labels and 31 identities exist**. During M3 that will look like
a conversion failure and direct debugging at the wrong layer. It is latent today
(0 NULL-tenant rows) and goes live the moment M3 writes product rows.

---

## 6. Recommended next step within the sequence

**Continue M3 using the pattern already proven by the ownership release.**

1. **Release the six remaining constraints by property group**, each with its own
   predecessor-definition guard (as `43_legacy_ownership_initialization.sql` does),
   its own forward migration and its own readback/rollback evidence.
2. **Sequence them so one entity becomes declarable first.** Releasing
   `entity_surface_native_pending_ck` + section + binding together makes a single
   entity's list/detail own typed columns — which is what Board **step E** and the
   Calendar component-catalogue row require.
3. **Close finding 2 before the first product-row write**, because M3 touches exactly
   the affected tables.
4. **Keep steps C/D and Calendar C-authoring parked** until the relevant groups are
   released — the Board and Calendar blueprints already say so, and nothing here
   changes that.

**No new sequencing is proposed.** Board steps A, B landed; C, D, E, F and Calendar
C-authoring remain exactly where the blueprints put them.

---

## 7. Bottom line

- **M2 is essentially complete** — labels, field identities and source provenance are
  all in place, both drafts are at revision 4, and the ownership migration is applied
  with a tightened guard. My earlier "source ownership uninitialised" finding is
  withdrawn.
- **M3 is the gate and has not started** — six blanket constraints, `layout_config` at
  102/102, zero native list modes.
- **The per-property release pattern is already proven** by the ownership migration, so
  M3 has a working precedent rather than needing a new mechanism.
- **One correction to my own prior reports:** "7 pending constraints, unchanged" was
  true in count but misleading in substance — one constraint was narrowed to release
  ownership. That was real progress I under-reported.

**Caveat:** source, migration ledger and DEV constraint definitions only. No deployed
runtime or browser behaviour was verified.

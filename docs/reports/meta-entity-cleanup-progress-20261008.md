# Meta Entity cleanup — progress status report

**Assessment only • 8 October 2026.** Quick status check on the Meta Entity cleanup
activity (the "parallel metadata cleanup" the Board and Calendar blueprints sequence
around). Not design authority, not a plan, not a qualification record.

Evidence: repository inspection at HEAD `014c4cc46` (8 Oct 21:34) and read-only DEV
queries. Local state only; no deployed behaviour was verified.

---

## 0. Verdict

**Output is very high; the cleanup gate has not moved.**

45 commits landed in roughly six hours, spanning two approved/proposed layout
blueprints and a new shared foundation. But the three measurements that define
cleanup _progress_ are **identical to the previous check**:

| Cleanup indicator                            |                 Value | Change    |
| -------------------------------------------- | --------------------: | --------- |
| Pending cutover constraints in DEV           |                 **7** | unchanged |
| `entity_surface.supported_modes` populated   |                 **0** | unchanged |
| `entity_surface.layout_config` still present | **102 / 102 (100 %)** | unchanged |

**Runtime and design work is racing ahead of the gate it depends on, and the queue
behind that gate is growing.**

---

## 1. Activity

| Metric                                                    | Value            |
| --------------------------------------------------------- | ---------------- |
| Commits since previous review (`6a90d909b` → `014c4cc46`) | **45** in ~6 h   |
| Design documents                                          | **4**            |
| Uncommitted files in working tree                         | **32**           |
| Documentation total (blueprints + runbook)                | **10,389 lines** |

### Design corpus

| Document                                                                         | Lines | Status                                                                       |
| -------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------- |
| [Entity Studio blueprint](../blueprints/entity-studio/blueprint.md)              | 6,058 | design authority                                                             |
| [Entity list Calendar](../blueprints/entity-list-calendar/blueprint.md)          |   504 | **proposed rev 3** — decisions 1,2,3,4,5,6,7,8,9,10,12 approved; **11 open** |
| [Entity list Board](../blueprints/entity-list-board/blueprint.md)                |   426 | **approved rev 4**                                                           |
| [Shared list layout foundation](../blueprints/entity-list-layouts/foundation.md) |    84 | **established** (move-only)                                                  |
| [Qualification runbook](../runbooks/entity-foundation-qualification.md)          | 3,317 | execution record                                                             |

---

## 2. What actually landed

**Layout runtime — real and useful:**

- **Board** steps A (0b-i), B1 (contracts/parsing/per-viewer resolution) and **B2
  (the read-only renderer)** — `ab6d253a8`, `4e3cba009`, `6a90d909b`
- **Calendar** list layout runtime (Month and Agenda) on the shared list — `27b9d74db`
- Detail field renderer bindings preserved through the shared runtime — `5e8344e19`
- `EntityRecordCard` extracted to `list-view/src/record-card.tsx`, single-sourced view
  modes — `79775182e`

**Authoring/component groundwork:**

- Reviewed Studio component resources published and activated — `50d26deab`
- Native bootstrap component evidence assembled from exact installed pins — `75de38e4c`
- Restricted native component evidence reads installed in DEV — `79eb29ed6`
- Legacy field validation preserved while admitting native typed fields — `f5ce9d610`
- Legacy field-key and native identity uniqueness separated — `45ad94689`

**Governance quality — genuinely strong:**

- Owner decisions captured **verbatim and dated** in each blueprint's decision section
- The layout foundation extraction is **move-only**, with an **independent diff
  verification** of commit `f3cfd6783` against Board rev 4 ("no substantive change;
  only table-column padding"). That is exactly the right way to move approved text.
- Every document carries an explicit authority label — "Not implementation authority",
  "the build waits behind the metadata-cleanup gate".

---

## 3. The gate — measured, unmoved

The cleanup's purpose is to move authoring off legacy JSONB onto typed columns. Three
independent measures say it has not advanced:

**3.1 Seven pending cutover constraints remain in DEV.** Each is a blanket CHECK
forcing its typed columns to stay NULL:

```
entity_change_set_native_pending_ck        entity_surface_native_pending_ck
entity_field_native_pending_ck              entity_surface_field_binding_native_pending_ck
entity_operation_native_pending_ck         entity_surface_section_native_pending_ck
entity_runtime_profile_native_pending_ck
```

**3.2 No native list authoring has been activated.** `entity_surface.supported_modes`
is non-null on **0** rows, so Board and Calendar cannot be declared for any entity.

**3.3 Every surface still carries the legacy blob.**

```
surfaces with layout_config = 102
surfaces total              = 102
```

**100 % of surfaces remain on the source the cleanup exists to retire.** No
native-cutover migration has landed since the `20261007_*_preparation` set; the only
later migration is the product-authoring audit.

---

## 4. What is queued behind the gate

This is the part to watch — the queue grew while the gate did not move:

| Blocked item                                                                                           | Source              | Condition                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------- |
| **Board step C** — 0b-ii identity scan + fallback removal                                              | Board §12.1         | "the identity scan is only meaningful on cleaned metadata"       |
| **Board step D** — reference members, guards, forward upgrade, compiler, generators, Studio dictionary | Board §12.1         | same package/DDL/generators as the cleanup                       |
| **Board decision 14.8** — shared-reference lists get modes + per-field flags                           | Board §14           | "waits behind the metadata-cleanup gate with step D"             |
| **Calendar authoring contract** §5.2–5.4                                                               | Calendar decision 7 | owner: _"approved its build is gated on the cleanup regardless"_ |
| **Board step E** — first real pilot                                                                    | Board §12.1         | needs C, D **and** native list activation                        |
| **Board Phase 1b** — List settings panel + Board editor                                                | Board §13           | composer host chain, which does not exist yet                    |

**Two approved layout features and one approved decision are now waiting on a gate
that has not moved.** Board §14.8 states the constraint plainly: _"Not available now:
a table-entity pilot, because only Country and State Region exist after the cleanup."_

---

## 5. Assessment

**What is working well:**

1. **Correct sequencing.** Runtime layouts were deliberately built to _not_ wait on
   authoring. That is exactly right — it produced user-visible value while the gate
   is closed.
2. **Governance discipline.** Verbatim dated owner decisions, move-only extractions
   with independent diff verification, explicit authority labels.
3. **Honest reporting.** No claim of completion, no manufactured authority.
4. **Real production volume** — 45 commits, measured, tested.

**The risk:**

**The queue is growing faster than the gate it depends on.** Two layout features
(Board, Calendar) plus a shared foundation landed in six hours; the gate moved zero.
If that ratio continues, the platform accumulates an ever-larger body of approved
layout design and runtime that cannot be declared for any entity, and the first
pilot slips correspondingly.

The gate is not blocked by a decision — every relevant decision is already approved.
It is blocked by **engineering on the cutover itself**: the 7 pending constraints,
`layout_config` retirement, source ownership, and native list activation.

**Secondary observations:**

- **Documentation load is now 10,389 lines** across four blueprints and the runbook,
  with the runbook alone at 3,317. Growth is outpacing consolidation.
- **32 uncommitted files** in the working tree, including Calendar runtime and
  composition files.
- **The RLS issue from the previous review is still open** — 16 `metadata` tables whose
  read policy excludes product-baseline rows, including `entity_label`,
  `entity_field_identity` and `entity_surface_view`. It remains latent and will
  surface as silent emptiness during the cutover.

---

## 6. Recommendation

**1. Re-point effort at the gate.** The cleanup is the single highest-leverage target:
it unblocks Board C/D, Calendar authoring, decision 14.8, the first pilot and Phase 1b
simultaneously. Nothing else multiplies like it.

**2. Attack the 7 pending constraints as one reviewed unit.** They share a shape
(blanket NULL CHECK → typed constraints + conversion + compiler). Bundling them into
one forward migration has a far better ratio than seven separate cycles.

**3. Sequence the cutover by surface, not by feature.** Convert Country's 102-surface
set (or a bounded subset) to typed columns first, so _one_ entity can be declared with
native list modes — that alone unlocks Board's pilot eligibility.

**4. Keep runtime work going, but cap the queue.** Additional layout designs (a third
list layout) should wait until at least one existing layout can be declared for a real
entity. Otherwise the approved-but-unusable inventory keeps growing.

**5. Close the RLS gap before the cutover.** 16 tables, including the enrollment
tables, will report silent emptiness once product reads touch them.

**6. Consolidate documentation.** Four blueprints plus a 3,317-line runbook is
approaching the point where review cost exceeds its value; the layout foundation
extraction shows the right consolidation pattern.

---

## 7. Bottom line

**The developer is producing at a high rate and the governance quality is good. But
the activity is concentrated on layout runtime and design, while the cleanup — the
gate that all of it depends on — has not measurably advanced:**

- 7 pending constraints (unchanged)
- 0 entities with native list modes (unchanged)
- 102 / 102 surfaces still on `layout_config` (unchanged)

Two approved layout features and one approved decision are now queued behind it, and
the first real pilot is unreachable until the cutover happens. **The most valuable next
move is not another layout — it is closing the cleanup gate.**

**Caveat:** this review measured source, documents, gates and DEV table counts. It did
not verify deployed runtime behaviour or browser rendering.

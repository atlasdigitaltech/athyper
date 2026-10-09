# Country / State Region — status review with cleanup assessment

**Assessment only • 8 October 2026.** Status review of Developer A's progress on the
Entity Studio blueprint for Country and State Region, including an assessment of the
cleanup approach. Not design authority, not a plan, not a qualification record. The
[Entity Studio blueprint](../blueprints/entity-studio/blueprint.md) and the
[Board blueprint](../blueprints/entity-list-board/blueprint.md) remain the design
authorities.

Evidence: local repository inspection at HEAD `6a90d909b`, plus read-only queries
against the DEV Studio database. Local test results are not deployed qualification.

---

## 0. Verdict

**Substantive, real progress — and the cleanup approach is working.** Enrollment has
moved from "prepared but unapplied" to **actually applied with immutable history and
authenticated authorship**. The Board blueprint is owner-approved and sequenced
around the cleanup rather than competing with it.

The two things that matter most now: **16 RLS policies remain unfixed** (latent,
silent-failure, directly on the enrollment write path), and **label translations are
still zero** despite Country declaring `en/ms/ar`.

---

## 1. What has actually landed

### 1.1 Country / State Region enrollment — DEV, measured

| Measure                          | Value  | Note                                       |
| -------------------------------- | ------ | ------------------------------------------ |
| `entity_label`                   | **63** | State Region 15 + Country 48               |
| `entity_field_identity`          | **31** | Country 22 + State Region 9                |
| `entity_label_translation`       | **0**  | ⚠️ Country declares `en/ms/ar`             |
| `entity_target`                  | **0**  | Targets still unpopulated                  |
| `reference_contract_version` set | 2      | the two reference drafts                   |
| Draft revision                   | **2**  | both drafts, with one command receipt each |

Per the runbook checkpoint: both drafts advanced revision 1 → 2, retain revisions 0/1/2,
and **all six graph hashes were recomputed and verified**. Country's source revision-1
hash and State Region's are recorded.

### 1.2 Authorship and control — the important part

Enrollment was authorized by a **real authenticated Platform Admin session** through
the existing `metadata.entity.author` governance adapter, with isolated issuer/app
connections, canonical repository transaction and audit append.

- No publication review receipt, service-account authorship or direct administrator
  draft write substituted for that authorization.
- Immutable migrations recorded in the existing ledger with SHA:
  `20261008_entity_product_command_authority.sql` and
  `20261008_entity_product_authoring_audit.sql`.
- Direct draft reads return no rows without admission; ownership `UPDATE` and forged
  admission reject.
- Runtime grants are a **closed inventory** — no broad metadata function or audit-table
  write grant.

### 1.3 My own earlier flag was handled correctly

I had raised that Country's two **"Record ID"** captions were an AGENTS.md
no-visible-UUID risk. The checkpoint records:

> "Equal captions did not merge identities; Country's two existing 'Record ID'
> captions remain source data, **not approval to display UUIDs**. Presentation
> validation and explicit technical-binding disposition remain mandatory before
> native compilation."

That is the right disposition — preserved as source, not silently merged, and gated
again at compilation.

### 1.4 Board — approved and sequenced

- Board blueprint **approved revision 4** by the project owner (8 October 2026), all
  seven decisions; each later-phase shape still needs its own approval.
- Step **A** (0b-i: `surface.unavailableModes`, no renderer fall-through, `view=`
  validation, exact tone lookup) — landed `ab6d253a8`.
- Step **B1** (contracts, published parsing, per-viewer resolution) — landed `4e3cba009`.
- Step **B2** (read-only Board renderer) — landed `6a90d909b`.
- Steps **C** and **D** explicitly **wait for the cleanup** because they edit the same
  Studio authoring package, DDL, generators and blueprint.

**The Board design holds the line:** no lane-field inference, no synthesized lanes,
no UUID on card/lane/chip/count/hint, fail-closed at every layer, and _"Board adds no
permission and no MFA requirement."_ Moves are deferred to Phase 2 through published
lifecycle operations.

---

## 2. Cleanup approach — assessment

**This is the strongest part of the current work, and it should be recognised as such.**

| Practice                                            | Evidence                                                                                                                                                                                | Verdict                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Sequenced by overlap, not ambition**              | Board steps C/D wait for the cleanup "because they edit the same Studio authoring package, DDL, generators and blueprint, and the identity scan is only meaningful on cleaned metadata" | ✅ Avoids concurrent edits to the same files — the correct reason to serialise |
| **Work split at real boundaries**                   | 0b split into 0b-i (mode availability, no fall-through, URL validation, tones) and 0b-ii (identity scan + fallback removal)                                                             | ✅ Separates non-overlapping from overlapping work                             |
| **Correction of prior findings, including mine**    | The runbook corrects a test-coverage claim I made (see §3)                                                                                                                              | ✅ Cleanup includes correcting its own and others' errors                      |
| **Dedicated CI job instead of incidental coverage** | New `entity-studio-foundation` job with `--fail-if-no-match`, wired into `ci-success`                                                                                                   | ✅ Removes reliance on a job that could be skipped                             |
| **Honest about gate state**                         | _"full repository CI is not claimed green"_; local proofs explicitly separated from installed/published authority                                                                       | ✅ No overclaiming                                                             |
| **DDL health improving**                            | `db:verify:migration-layout` now **159 classified / 151 retained** (was 141/133)                                                                                                        | ✅ Gate passing                                                                |
| **Evidence discipline**                             | Hashes, SHAs, revision numbers, receipts, backup locations                                                                                                                              | ✅ Reproducible                                                                |

**Assessment: the cleanup is well-scoped, correctly serialised, and evidence-backed.**
It is the right model for the remaining work.

---

## 3. Correction — my earlier test-coverage finding was wrong

I previously reported that **88 of 139 test files ran in no CI job**. **That was
wrong, and the runbook's correction is accurate.** I verified it:

```
ci.yml:121              run: pnpm run test:workspace
package.json            test:workspace = turbo test
authoring package.json  test = vitest run        ← discovers all src/**/*.test.ts
```

So the full authoring suite **is** executed in CI, and Turbo's `src/**/*.test.ts`
discovery auto-enrols every test. The files were outside the _explicit filename
lists_, not outside CI.

**My error was inferring absence from one artifact without following the indirection**
— the same failure mode as the overlay claim earlier in this review. The developer's
diagnosis is more precise than mine and is the real finding:

> "The actual execution gap was that preceding static policies, code generation, lint
> and typecheck failures **could prevent the workspace step from running**."

That subtlety is now fixed by the dedicated `entity-studio-foundation` job. Credit
where it is due: **the cleanup caught and corrected my mistake, and their fix addresses
a sharper problem than the one I described.**

---

## 4. Remaining blockers

Per the runbook's own "Still required" list, plus what I verified:

| #   | Blocker                                                 | Evidence                                                                | Where it bites                                                       |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **Source ownership uninitialised**                      | Both drafts still have **NULL source kind**                             | Blocks native conversion and publication                             |
| 2   | **Released-field identity correspondence / allocation** | 31 identities exist, but released-line lineage unqualified              | F9 gate; blocks released entities                                    |
| 3   | **Native conversion / application / history**           | Not executed                                                            | The actual cutover                                                   |
| 4   | **Whole-release acceptance**                            | Not performed                                                           | End-to-end proof                                                     |
| 5   | **Deployed F6/F8/F9**                                   | Fixture-only                                                            | Live reads                                                           |
| 6   | **Label translations = 0**                              | Measured above                                                          | ⚠️ Country declares `en/ms/ar`; labels enrolled without translations |
| 7   | **`entity_target` = 0**                                 | Measured above                                                          | Delivery is not declaration-driven                                   |
| 8   | **Native list authoring not activated**                 | `entity_surface_native_pending_ck` still forces typed list columns NULL | Blocks Board live publication                                        |

---

## 5. Open hygiene issues

| Issue                                                        | Evidence                                                    | Severity                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------- |
| **16 RLS read policies still exclude product-baseline rows** | `pg_policies` count unchanged at **16**                     | ⚠️ **High — latent, silent**    |
| **One file unformatted**                                     | `server/db/migrations/inventory.json`                       | Low — run `pnpm format:changed` |
| **10 uncommitted files**                                     | incl. a new `47_product_draft_creation.sql` and its PG test | Medium — unprotected work       |

### The RLS issue, restated precisely

16 `metadata` tables have a `tenant_read` policy of
`tenant_id = shared.current_tenant_id_soft()` with **no `tenant_id IS NULL` clause**.
Since `current_tenant_id_soft()` returns NULL without tenant context, product-baseline
rows evaluate `NULL = NULL` → NULL → **excluded**.

The affected set includes **`entity_label`, `entity_label_translation`,
`entity_field_identity`, `entity_field_access`, `entity_predicate`,
`entity_surface_view`** — i.e. **exactly the tables the enrollment path writes and
reads**.

**Failure mode is silent emptiness:** the composer reads zero rows and reports
"nothing enrolled yet" _while 63 labels and 31 identities exist_. That will look like
enrollment failure, not an authorization denial — and the debugging will go the wrong
direction.

**Latent today** (0 NULL-tenant rows), **live the moment native conversion or product
reads touch these tables.** This is the highest-value unblocked fix on the board.

---

## 6. Recommendation

**Priority 1 — before any further enrollment or conversion:**

1. **Fix the 16 RLS policies** via a reviewed forward migration, restoring
   `tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft()` on read and
   delete. Add the negative fixture (product row readable under tenant context;
   tenant row not readable cross-tenant).
2. **Extract one canonical tenant-policy set** with a per-table tenancy
   classification (`product_visible` / `tenant_only` / `system_only`), so the class of
   divergence cannot recur — the generator and hand-written paths currently disagree.
3. **Commit the 10 in-flight files** and run `pnpm format:changed`.

**Priority 2 — close the enrollment gaps:**

4. **Label translations** — 63 labels with 0 translations, against a declared
   `en/ms/ar` requirement.
5. **Source ownership initialisation** — the top functional blocker; both drafts have
   NULL source kind.
6. **Populate `entity_target`** so delivery is declaration-driven.

**Priority 3 — keep the cleanup model:**

7. **Continue sequencing by overlap.** The Board blueprint's rule — steps that touch
   the same package/DDL/generators wait — is correct and should govern the remaining
   Country/State Region → Board handoff.
8. **Keep local proof and installed authority separate** in reporting, as the runbook
   currently does. That discipline is what makes the status trustworthy.

---

## 7. Bottom line

**The work is in materially better shape than at the previous review.** Enrollment is
real, authored by an authenticated human through the governed path, with immutable
history verified. The Board blueprint is approved and deliberately sequenced around the
cleanup rather than racing it. The cleanup itself is well-scoped and even corrected an
error of mine.

**Two things stand between this and a clean handoff:** the **16 unfixed RLS policies**,
which will produce silent empty results on exactly the tables enrollment uses, and
**zero label translations** against a three-locale requirement. Both are concrete,
bounded, and independent of the remaining ownership and F9 work.

**One caveat:** this review verified source, gates and DEV table counts. It did **not**
verify deployed runtime behaviour, browser rendering, or the Board on a real entity —
those remain unestablished.

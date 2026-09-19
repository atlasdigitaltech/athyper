**Development Jobs duplicate audit and repair — 2026-09-06**

Completed against the development PostgreSQL container `athyper-dev-db-1`, PostgreSQL 16.13. QA and other environments were not modified. Audits were read-only; the source changes occurred only after rehearsal against logical copies of all three physical application databases.

| Plane / database | Duplicate groups before | Queued rows archived and removed | Duplicate groups after | Terminal attempts preserved |
| --- | ---: | ---: | ---: | ---: |
| Studio / `athyper_studio` | 15 | 15 | 0 | 27 |
| Neon / `athyper_neon` | 6 | 6 | 0 | 6 |
| Mesh / `athyper_mesh` | 1 | 1 | 0 | 1 |
| Total | 22 | 22 | 0 | 34 |

Each group contained exactly one never-started queued row and one terminal row with matching tenant, queue, stored BullMQ job ID, job identity, creator, and input payload. None of the queued rows had attempt evidence, command evidence, parent references from another execution, or replacement references from a command. The retained rows comprise 19 successful executions and three genuine dead-letter executions. Those failures and their histories were preserved; this repair did not retry them.

The migration archived the full original queued row and the retained terminal row snapshot in `ops.job_execution_duplicate_archive` before removing the queued duplicate. The archive records the original-to-canonical ID mapping, source database, repair ID `jobs-duplicate-executions-20260906-v1`, administrator and time. Forced RLS and an append-only trigger protect the archive. No canonical row, execution attempt, command, or foreign-key reference was rewritten. Whole-table fingerprints confirmed that attempts and commands were unchanged within each transaction.

The repair was rehearsed in `athyper-jobs-repair-copy-20260906`, a PostgreSQL container with Docker network mode `none` and no published ports. All 24 checks passed: eight per plane covering refusal cases, rollback, commit, idempotence, archive immutability, exact-row restoration, and post-repair duplicate counts. The test container was stopped after verification and retained for inspection. It can be started with `docker start athyper-jobs-repair-copy-20260906`; the automated verifier expects fresh copies, not the already-repaired retained copies.

The exact tested plans then passed dry runs against development and were committed in one transaction per database. Transactions were atomic within each plane; this was not a distributed transaction across the three databases. A fresh read-only audit confirmed zero duplicate groups in every plane.

Scripts and instructions: [Jobs repair migration](../../server/db/scripts/operations/repair/jobs-execution-duplicates/README.md).

Private evidence is retained at `/home/chandravel_natarajan/.local/state/athyper/jobs-repair/2026-09-06-execution-duplicates/` (directory mode 0700, files 0600):

- `studio.dump`, `neon.dump`, `mesh.dump`: pre-repair logical database snapshots.
- `<plane>.json` and `<plane>-after.json`: before/after read-only audit reports.
- `<plane>-plan.json`: exact execution pairs and row fingerprints.
- `<plane>-source-dry-run.json` and `<plane>-source-applied.json`: transactional receipts.
- `copy-verification.json`: the 24 passing checks.
- `sha256.json`: snapshot and migration checksums.

The archive and private snapshots retain full original row data for recovery. They were not added to Git. No runtime deployment was performed as part of this data repair, and the result establishes the absence of duplicate groups at the post-repair audit time rather than guaranteeing they can never recur.

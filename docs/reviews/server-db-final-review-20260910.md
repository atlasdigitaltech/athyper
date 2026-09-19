# Final database review — 2026-09-10

Three actionable findings remain in the database tooling. All three were reproduced against disposable PostgreSQL 16.13 with networking disabled and database storage on tmpfs. No development or QA database was modified. This round reports findings; it does not change implementation or migration files.

## 1. P2 — Foundation resume fabricates receipts for skipped files

Location: `server/db/scripts/provisioning/foundation-runner.ts:54–60,76–92`.

When `--resume-from` is supplied, the runner skips the freshness check and executes only the selected suffix. However, each executed entry supplies the entire manifest prefix to `receiptSql`, which inserts missing receipts without checking that those earlier entries were executed. Final reconciliation then accepts the receipts it just manufactured.

Reproduction used this three-file manifest:

```text
common/_database/02_schema_provisions.sql
skipped.sql
final.sql
```

The first file was the repository's actual ledger DDL. `skipped.sql` contained `CREATE TABLE public.should_exist(id integer);`; `final.sql` contained `SELECT 1;`. After manually creating only the ledger in the isolated database, running the actual foundation CLI with `--plane=neon --container=<isolated-container> --ddl-root=<fixture>/ddl --resume-from=final.sql` exited successfully with `mode: applied` and `receiptCount: 3`.

```sql
SELECT to_regclass('public.should_exist') IS NULL AS missing_table,
       EXISTS (SELECT 1 FROM public.schema_provisions
               WHERE file_name = 'skipped.sql') AS has_receipt;
-- missing_table = true; has_receipt = true
```

An incorrectly selected resume point can therefore leave foundation objects absent while recording a fully applied manifest. Validate the skipped prefix against existing matching receipts before executing anything, and only insert receipts for files actually executed in the current run. Handle the initial pre-ledger bootstrap explicitly rather than accepting arbitrary missing prefix receipts.

## 2. P2 — Catalog drift comparison omits view definitions and security options

Location: `server/db/scripts/reports/database-drift.ts:51–142`.

The catalog captures view columns, but not `pg_get_viewdef` or view `reloptions`. Consequently, removing a view's filter or `security_invoker` produces no difference if its output columns stay the same. This directly weakens verification of the document-view isolation repairs from the earlier review. Relation/function privileges and ownership are also absent from the comparison.

Reproduction captured all eight of the script's exact catalog queries with schema `probe`, before and after:

```sql
CREATE SCHEMA probe;
CREATE TABLE probe.t(id integer, label text DEFAULT 'a  b');
CREATE VIEW probe.v WITH (security_invoker=true, security_barrier=true)
  AS SELECT id FROM probe.t WHERE id=1;
-- Capture catalog.
ALTER VIEW probe.v RESET (security_invoker);
CREATE OR REPLACE VIEW probe.v AS SELECT id FROM probe.t;
-- Capture catalog again.
```

Every captured category remained equal even though the view lost its filter and invoker setting. The strict-mode drift count is therefore zero for these changes. Compare view/materialized-view definitions, security-relevant relation options, ownership, and effective ACLs. Add a regression that changes only `security_invoker` on otherwise identical views.

## 3. P2 — Whitespace normalization hides changed SQL literals

Location: `server/db/scripts/reports/database-drift.ts:144–153`.

`normalize()` collapses every whitespace sequence in catalog definitions, including whitespace inside SQL string literals and function bodies. Those characters can affect defaults, checks, policy expressions, and function behavior; they are not always formatting.

After the previous fixture, changing the column default from `'a  b'` to `'a b'` left all normalized catalog maps equal:

```sql
ALTER TABLE probe.t ALTER COLUMN label SET DEFAULT 'a b';
```

The actual catalog default changed, but the comparator concealed it. Preserve catalog-produced SQL verbatim, or use SQL-aware normalization that preserves quoted strings, dollar-quoted bodies, quoted identifiers, and comment boundaries. Test a literal-only change independently of ordinary formatting changes.

## Validation and limits

`pnpm --dir server/db test` passed: 149 tests, zero failures. These passing checks do not cover the three failures reproduced here. Test output is in `/tmp/athyper-final-review-tests.log`.

The foundation reproduction invoked the actual CLI. The drift reproductions executed the exact catalog SQL extracted from the script and applied its whitespace-normalization rule; they did not invoke the two-URL report CLI. The disposable container was removed afterward. Reproduction output is in `/tmp/athyper-final-review.log` for this workspace session.

This final pass focused on migration/provisioning safety and verification gaps around the earlier repairs. It is not a claim that every database function is defect-free, and no additional tenant-data leak was reproduced in this round.

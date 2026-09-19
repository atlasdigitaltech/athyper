# Round 2 fixes — 2026-09-10

**Follow-up:** [additional grant and preflight hardening](server-db-audit3-fixes-20260910.md) caps AI diagnostics at 20 rows and adds optional-role handling.

Implemented all three requested hardening changes. This supersedes the earlier
assessment's recommendation to retain discovery's original-result status.

- **AI compatibility:** a new, ordered `20260910_ai_call_usage_preflight.sql`
  checks completed calls under a table lock. Incompatible rows cause a descriptive
  `23514` containing the total and up to 20 sample IDs. The transaction rolls back
  without changing call data or partially replacing the constraint. Compatible
  installations receive a fully validated constraint; no usage is fabricated.
- **Discovery status:** canonical DDL and
  `20260910_mesh_discovery_current_status.sql` now return the capability's current
  status for receipt replays and the fresh/legacy child-command path. IDs remain
  idempotent, and retries do not mutate lifecycle state. This intentionally changes
  discovery's response contract; other Mesh command replay contracts are unchanged.
  Status is a read at response-query time, not a guarantee against later changes.
- **Missing constraints:** AI and Mesh preparatory migrations use
  `DROP CONSTRAINT IF EXISTS` and install the validated definitions before the
  historical repair migrations. The Mesh preparatory file is
  `20260910_mesh_capability_constraint_preflight.sql`. All three new files are
  registered in the applicable deployment manifests. Historical migration bytes
  and checksums are preserved. Use the ordered manifests, rather than invoking
  the historical repair files alone, to obtain missing-constraint recovery.

Validation:

- 147 database unit tests passed; focused parity/manifest tests also passed after
  their final update.
- Studio, Neon, and Mesh fresh foundations passed on isolated PostgreSQL 16.13.
- Incompatible AI fixture produced the expected count and ID, left data unchanged,
  and rolled back the constraint operation. Compatible/missing-constraint and
  repeated-preflight cases passed.
- Real deployment runner passed with both AI and Mesh constraint names initially
  absent; its second execution safely skipped applied migrations.
- Discovery replays returned `active` after acceptance and `ended` after withdrawal,
  with unchanged IDs. Legacy date-boundary retries and full upgrade parity passed.
- Existing tenant-isolation, saved-default, bank-retrieval, identity, and concurrent
  suspension regressions passed. DDL model and whitespace checks passed.

No development, QA, or production databases were changed. The disposable container
was removed; no commits were created. Logs use `/tmp/athyper-db-round2-fix-*.log`.

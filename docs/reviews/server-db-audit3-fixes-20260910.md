# Additional database audit fixes — 2026-09-10

Reviewed A–E and implemented A–D. E is an ownership invariant, now documented and
checked in the integration catalog assertions without widening private access.

| Finding | Resolution |
|---|---|
| A — Optional application role | Both grant migrations check `pg_roles` before referencing `athyperapp`. PUBLIC access to the accounting cache is revoked unconditionally, independently of role existence. |
| B — AI full-count preflight | Replaced the full count plus separate sorted ID scan with one query collecting at most 20 incompatible IDs. Diagnostics explicitly describe a sample, not a total. Raised the preflight statement timeout to 15 minutes; the lock-acquisition timeout remains 5 seconds. |
| C — Legacy saved-default privileges | Canonical DDL and a new all-plane `20260910_saved_view_legacy_grant_cleanup.sql` revoke SELECT/INSERT/UPDATE from `athyper_runtime` when it exists. The new migration also cleans installations that already received the application-role grant. |
| D — Discovery migration timeout | Added explicit `SET LOCAL statement_timeout='60s'` to the discovery status upgrade. |
| E — Receipt policy ownership | Documented that a non-bypass function owner must be covered by the private receipt policy. Added a catalog assertion after the full upgrade chain. Ownership changes must migrate the policy deliberately; no PUBLIC/runtime receipt access was added. |

The edited upgrade files were local, undeployed additions from this session.
Previously deployed historical repairs were not edited. If these local revisions
are deployed later, their recorded checksums must remain immutable thereafter.

The AI change bounds incompatible-row diagnostics, not clean-table verification:
proving no violations and validating the CHECK still require scanning the table.
This remains a blocking migration and is not a production-scale performance
benchmark. It does not invent usage values or leave the constraint unvalidated.

Validation completed:

- **147 unit tests passed**, and the DDL model check passed.
- Missing-role migrations executed twice before application-role creation, then
  twice after role creation. PUBLIC cache access and legacy grants were removed;
  application access to the intended projections remained available.
- The AI fixture with 25 incompatible rows reported exactly 20 sample IDs;
  rollback, single-row diagnostics, clean data, missing constraints, and repeated
  execution passed.
- Fresh Studio, Neon, and Mesh foundations passed on isolated PostgreSQL 16.13.
- Full upgrade/behavioral suite passed, including actual deployment entrypoint
  application/replay, view isolation, discovery lifecycle status, bank retrieval,
  concurrent suspension, and receipt-owner policy coverage.
- Whitespace checks passed. The disposable container was removed.

No application/dev/QA databases were modified and no commits were created.
Logs use `/tmp/athyper-db-audit3-*.log`.

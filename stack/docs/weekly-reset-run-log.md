# Weekly DB Reset Run Log

This log tracks the weekly full reset, re-seed, export, and restore exercise until the base version is complete.

| Date | Git ref | Scope | Result | Notes |
|---|---|---|---|---|
| 2026-05-14 | `feature/finance-core` / `d9779fc` | Full baseline | Yellow | Reset and seed passed, post-status clean, backup wrapper fixed and verified. API health failed because the API container was already unhealthy. Schema restore comparison had only pg_dump canonicalization noise. |

## 2026-05-14

### Result

Yellow.

The database provision path is healthy, but the full weekly gate is not Green yet because runtime API health failed and the schema diff still needs a normalized comparator.

### Commands and Outcomes

| Check | Outcome |
|---|---|
| Pre-reset status | `Total: 655 | OK: 655 | Pending: 0 | Changed: 0` |
| Reset and seed | Passed: phases `[1,2,3]`, `executed=655`, `totalMs=165006` |
| Post-reset status | `Total: 655 | OK: 655 | Pending: 0 | Changed: 0` |
| Web liveness | Passed: `athyper-athyper-neon-web-1` returned `/livez` |
| API health | Failed: `athyper-athyper-api-1` refused health checks |
| Restore compare | Passed restore; object counts matched |
| Schema diff | Non-empty but appears to be pg_dump `\restrict` token and expression reserialization noise |
| Official backup wrapper | Fixed and verified after the run using Docker `pg_dump` fallback |

### Backup Folders

| Purpose | Folder |
|---|---|
| Pre-reset backup | `D:\Stack\athyper\backups\20260514T093711Z` |
| Post-seed backup used for compare and cleaned SQL extraction | `D:\Stack\athyper\backups\20260514T094453Z` |
| Official wrapper verification backup | `D:\Stack\athyper\backups\20260514T102721Z` |

### Artifacts

| Artifact | Path |
|---|---|
| Pre-status log | `.codex-logs\weekly-reset-pre-status.log` |
| Reset/reseed log | `.codex-logs\weekly-reset-reseed.log` |
| Post-status log | `.codex-logs\weekly-reset-post-status.log` |
| Schema diff | `.codex-logs\weekly-reset-schema.diff` |
| Cleaned SQL bundle | `.weekly-db-checks\cleaned-sql-20260514T095556Z` |
| Ordered SQL restore bundle | `.weekly-db-checks\ordered-sql-20260514T102721Z` |
| Ordered SQL restore validation log | `.codex-logs\ordered-sql-restore-validate.log` |

### Follow-Up Defects

- API container health: logs show `boot_failed Invalid URL TypeError: Invalid URL` from `parseRedisUrl` in `server/src/kernel/bootstrap.ts`.
- Schema comparison: add a normalized comparator that strips pg_dump `\restrict` tokens and ignores harmless predicate reserialization.
- Cleaned SQL extraction: generated data scripts are review material, not direct seed replacements, because pg_dump reported circular foreign-key relationships.

### Ordered SQL Bundle

Generated from `D:\Stack\athyper\backups\20260514T102721Z\athyper_neon_20260514T102721Z.dump`.

Restore order:

1. `00_pre_data_schema.sql`
2. `20_data.copy.no_tracking.sql`
3. `25_tracking_data.copy.sql`
4. `90_post_data_constraints_indexes_triggers_rls.sql`

Validation passed by replaying the scripts into `athyper_neon_ordered_compare` with `psql ON_ERROR_STOP=1`.

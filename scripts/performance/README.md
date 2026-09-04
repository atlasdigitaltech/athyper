# Performance scripts quick start

The performance scripts in this folder can read a Playwright storage state from:

- `tests/e2e/.auth/storage-state.json` (default, if present)
- `PERF_NEON_STORAGE_STATE` (explicit override)

If your local machine does not have `tests/e2e/.auth/storage-state.json`, export the path first:

```bash
export PERF_NEON_STORAGE_STATE=path/to/storage-state.json
```

Example:

```bash
export PERF_NEON_STORAGE_STATE=artifacts/storage-state.local.json
export PERF_NEON_BASE_URL="https://your-neon-env.example.com"
pnpm tsx scripts/performance/capture-cache-observability-baseline.mjs
```

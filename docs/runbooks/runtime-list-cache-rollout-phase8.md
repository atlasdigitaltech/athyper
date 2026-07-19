# Runtime-list cache rollout — Phase 8

Status: common runtime implementation enabled through metadata; temporary entity-name canary checks removed.

## Final control model

All authenticated runtime lists use the same session configuration cache, shell-level browser cache, hydration boundary, mutation invalidation API, and intent-prefetch component. Cache behavior is resolved in this order:

1. Tenant `cachePolicy` overlay.
2. Explicit entity `display_config.list_cache` policy.
3. Exact entity-class policy.
4. Platform default.

Entity names are not policy inputs. `journal_entry` and `purchase_invoice` were rollout canaries only; neither is hardcoded in the final list route or prefetch eligibility logic.

The dashboard environment variable `ATHYPER_DASHBOARD_PREFETCH_ENTITIES` selects which real dashboard links are exposed for intent measurement. It does not grant cache eligibility: each descriptor must still resolve to `mode !== "disabled"` and `prefetch === "intent"`.

Authenticated upstream requests retain `cache: "no-store"`. Deliberate reuse occurs only in the identity-, tenant-, organization-, permission-, descriptor-, scope-, and query-scoped application caches above those requests.

## Rollout progression

Use metadata changes, not code branches, for each step:

1. Instrumentation only: set the target policy `mode` to `disabled`; capture the five scenarios.
2. Session configuration cache: enable the scoped server cache and verify request counts and generation invalidation.
3. Canary: add explicit entity policies for Journal Entry and Purchase Invoice while leaving their class disabled.
4. Entity-class expansion: move proven values into the exact class profile and remove redundant entity overrides.
5. Transactional default: enable the platform/class default for transactional lists.
6. Tenant tuning: apply a validated overlay only where a tenant needs a different retention or prefetch posture.
7. Finalization: delete temporary entity overrides that merely duplicated the class/default policy. No entity-name checks remain in application code.

A tenant overlay uses the canonical metadata policy field names:

```json
{
  "kind": "tweak_policy",
  "path": "policy",
  "value": {
    "cachePolicy": {
      "fresh_for_seconds": 30,
      "retain_for_seconds": 600,
      "prefetch": "intent"
    }
  }
}
```

The metadata audit applies the same negative-TTL, retention, restricted-storage, eager-prefetch, and mutation-invalidation rules to tenant overlays.

## Acceptance evidence

Start Neon with the target entity exposed as a dashboard quick-access link so the harness performs shell-preserving client navigation. Supply authenticated storage state plus fixture-safe context-switch, restore, and mutation requests as described in the Phase 1 runbook.

```powershell
$env:ATHYPER_DASHBOARD_PREFETCH_ENTITIES = 'journal_entry,purchase_invoice'
$env:PERF_ENTITY_PATH = '/app/journal_entry'
pnpm perf:capture:cache-observability
pnpm perf:verify:runtime-list-cache-rollout -- '<artifact-path>'
```

The gate fails when:

- Cold rows are not visible under 2,000 ms median.
- Warm rows are not visible within 500 ms median.
- A warm navigation displays the list skeleton.
- The warm route does not consume a fresh/stale browser entry.
- The valid descriptor window is not a cache hit.
- Session configuration or saved views are loaded more than once per warm route.
- A different query, context switch, or mutation revisit reuses an incompatible cache entry.

Run the deterministic checks before environment evidence:

```powershell
pnpm --filter @athyper/runtime-list test
pnpm --filter @athyper/runtime-list typecheck
pnpm --dir server run metadata:cache-policy:audit
pnpm test:runtime-list-cache-rollout-gate
```

The runtime-list tests cover bounded LRU/memory eviction, descriptor and scope validation, session/context clearing, warm hydration without table replacement, scroll restoration, mutation invalidation, and refresh failure retention. Saved-view mutations use the shared session-configuration invalidation path, so the next descriptor/list resolution observes the changed definition immediately.

## Release decision

Keep longer retention and intent prefetch as metadata values for frequently reused entities. Do not fork the list UI or introduce new canary entity checks. Roll back a problematic cohort by setting its entity/class/tenant policy to `mode: "disabled"`; the authenticated upstream request remains `no-store` throughout.

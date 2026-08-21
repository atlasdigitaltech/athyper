# Meta-entity legacy retirement gate

Legacy descriptor fan-out, offset/count defaults, direct writes, and scan invalidation are compatibility mechanisms, not fallback architecture. Removal is allowed only per route/component after all conditions hold:

1. rollout state is `full_rollout`;
2. stable qualification passes query, p95, transaction, tenant isolation, permission revocation, invalidation, durable mutation, security parity, and cache parity gates;
3. the inventory's `retirementMetric` reports zero production traffic continuously for at least `releaseWindowDays`;
4. an evidence artifact records the zero-traffic start/end and release identifiers;
5. the owner approves removal and rb-13/rb-25/rb-26 remain usable without the compatibility code.

Deletion PRs must update `config/governance/meta-entity-routes.json`. A broad Redis `SCAN`, a direct generic write path, or a default exact count/offset path may not be reintroduced as rollback behavior.

Before deleting a compatibility path, add its observed window and qualification artifact to `config/governance/meta-entity-retirement-evidence.json`, then run:

```bash
pnpm retire:meta-entity --route=<route-id> --current=<stable-report.json>
```

Each route record must include the owner, release ID, observation release ID,
`releaseCompleted: true`, the required number of complete releases, explicit
`compatibilityTraffic: 0`, `shadowValidationPassed: true`,
`shadowDifferences: 0`, a schema-versioned qualification artifact with
`passed: true`, retained rollback-flag details, and complete runbook coverage.
The command fails closed when any field, file, or observation window is
missing. Passing the command is a prerequisite for the deletion change; it
does not delete the compatibility route itself.

The checked-in baseline is not silently rewritten after a regression. Baseline changes require a passing report and review from the route owner; temporary regressions use a named, reasoned, expiring entry in `meta-entity-performance-exceptions.json`.

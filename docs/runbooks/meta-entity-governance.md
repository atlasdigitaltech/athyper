# Meta-entity release qualification and retirement

Owner: Platform Performance / route owner.

Run the governance and test-matrix checks on every change to a protected
generic route:

```bash
pnpm policy:meta-entity
pnpm test:meta-entity-governance
pnpm test:meta-entity-dependencies
```

The dependency contract in `config/governance/meta-entity-dependencies.json`
keeps phase-8 prerequisites (durable invalidation, stable handler names,
seeded execution metadata, and representative performance fixtures) explicit.
It also records the plan exclusions so a later optimization cannot silently
expand the base-framework scope.

The stable-environment qualification job consumes a signed report and the
checked-in baseline. It fails on a query-budget violation, missing security or
cache parity, a p95 regression over 15% without an expiring approved exception,
or an invalidation/outbox SLO breach. Artifacts are retained by the
`meta-entity-performance-qualification` workflow; do not rewrite the baseline
to hide a regression.

## Rollback signals

Roll back the affected entity/operation cohort when any of these are observed:

- tenant isolation or permission-revocation mismatch;
- descriptor generation does not converge within the invalidation SLO;
- duplicate or non-deterministic mutation replay, failed audit/outbox commit,
  or a transaction/pool-wait budget breach;
- server errors or p95 exceed the qualification threshold.

Read and mutation flags are scoped by plane, tenant cohort, entity, and
operation. Shadow and dual-read modes must return only the existing result;
never run two authoritative writes for one request. Redis impairment disables
acceleration and falls through to PostgreSQL snapshot compilation.

## Compatibility retirement

Use `pnpm retire:meta-entity --route=<id> --current=<report.json>` only after
the route is full rollout, qualification is green, and the compatibility
traffic metric is zero for the complete release window. Record the owner,
release identifiers, zero-traffic interval, and qualification artifact in
`config/governance/meta-entity-retirement-evidence.json` before deleting the
compatibility path. Generation bumps and metadata rollback remain available
through the compatibility window.

Dashboards are provisioned from
`stack/config/telemetry/provisioning/dashboards/json/meta-entity-performance.json`.
Monitor descriptor cache hit rate, SQL count, transaction duration, pool wait,
invalidation lag, outbox lag, observability coverage, and compatibility traffic.

# P0 meta-entity baseline result

- Commit:
- Date/time (UTC):
- Dataset profile: small | medium | skewed
- API replicas / CPU / memory:
- PostgreSQL topology and version:
- Redis topology and version:
- Warm-up procedure:
- k6 command and environment (secrets removed):

## Three-run comparison

| Scenario | Run | Throughput | p50 | p95 | p99 | Error rate | SQL/request | Redis/request | Pool wait p95 | Transaction p95 | Response bytes p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| descriptor | 1 | | | | | | | | | | |
| descriptor | 2 | | | | | | | | | | |
| descriptor | 3 | | | | | | | | | | |
| list | 1 | | | | | | | | | | |
| list | 2 | | | | | | | | | | |
| list | 3 | | | | | | | | | | |
| detail | 1 | | | | | | | | | | |
| detail | 2 | | | | | | | | | | |
| detail | 3 | | | | | | | | | | |
| create | 1 | | | | | | | | | | |
| create | 2 | | | | | | | | | | |
| create | 3 | | | | | | | | | | |
| patch | 1 | | | | | | | | | | |
| patch | 2 | | | | | | | | | | |
| patch | 3 | | | | | | | | | | |
| aggregate | 1 | | | | | | | | | | |
| aggregate | 2 | | | | | | | | | | |
| aggregate | 3 | | | | | | | | | | |

## Repeatability

- Maximum throughput variance:
- Maximum p50 variance:
- Maximum p95 variance:
- Maximum p99 variance:
- Within 10% gate: yes | no

## Top SQL and descriptor payloads

Attach the output of [`../sql/top-framework-statements.sql`](../sql/top-framework-statements.sql)
and the before/after `/metrics` snapshots. Record the top descriptor payloads
from `athyper_framework_response_bytes` grouped by entity.

## Findings and owned follow-ups

| Rank | Cost or regression | Evidence | Owner | Proposed change | Target phase |
|---:|---|---|---|---|---|
| 1 | | | | | |

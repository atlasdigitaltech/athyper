# Meta-entity Redis impairment

Owner: Platform Ops.

Redis accelerates descriptor and result access; it is not the authorization or metadata authority. During impairment the provider must report `L3_REDIS_DEGRADED`, load from PostgreSQL, retain plane/tenant scope, and run authorization normally. PostgreSQL mutation, audit, idempotency, and outbox atomicity remains unchanged.

1. Determine whether cache Redis, BullMQ Redis, or both are affected.
2. Watch L3 load rate, DB pool wait, API errors, transaction duration, and outbox lag.
3. Freeze metadata publication if pool wait breaches SLO; never disable authorization.
4. Roll back affected cohorts if tenant/security parity fails or DB saturation persists.
5. Restore Redis and allow content-addressed L2/L1 fills. Do not scan or delete payloads.
6. If convergence still fails after Redis is writable, perform an exact generation bump.

Recovery requires cache/security parity, cross-tenant tests, normal L1/L2 hits, and outbox lag back within SLO.

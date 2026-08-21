# Outbox lag

Monitor pending/failed age and delivery throughput by topic. If lag grows, pause rollout, preserve database writes, increase workers only within the PostgreSQL connection budget, and replay failed events by stable event key. Do not delete pending rows. Escalate dead-letter growth with the oldest event IDs and tenant.

-- Capture after each P0 run. Requires pg_stat_statements.
-- Do not reset shared production statistics for a benchmark.
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_exec_ms,
  round(mean_exec_time::numeric, 2) AS mean_exec_ms,
  rows,
  temp_blks_read,
  temp_blks_written,
  shared_blks_hit,
  shared_blks_read,
  left(regexp_replace(query, '\s+', ' ', 'g'), 500) AS normalized_query
FROM pg_stat_statements
WHERE query ILIKE ANY (ARRAY[
  '%control.entity%',
  '%snapshot.entity_compiled%',
  '%event.document_runtime_idempotency%',
  '%audit.%',
  '%event.outbox%'
])
ORDER BY total_exec_time DESC
LIMIT 20;

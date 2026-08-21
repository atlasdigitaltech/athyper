# PostgreSQL pool exhaustion

Check pool wait, active transactions, lock wait, and PgBouncer saturation. Reduce worker concurrency and disable nonessential rollout cohorts before increasing pool size. Terminate only confirmed abandoned sessions. Verify tenant GUC/RLS behavior after recovery.

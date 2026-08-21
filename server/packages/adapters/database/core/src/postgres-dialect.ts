import { PostgresDialect } from "kysely";

import type { PostgresPool } from "./pool.js";

export function createPostgresDialect(pool: PostgresPool): PostgresDialect {
  return new PostgresDialect({ pool });
}

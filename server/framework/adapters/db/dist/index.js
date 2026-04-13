// src/kysely/db.ts
import { Kysely } from "kysely";

// src/kysely/dialect.ts
import { PostgresDialect } from "kysely";
function createPostgresDialect(pool) {
  return new PostgresDialect({
    pool
    // Kysely expects any for pool
  });
}

// src/kysely/pool.ts
import pg from "pg";
var { Pool } = pg;
function createPool(config) {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 3e4,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 1e4,
    // Disable application_name to avoid PgBouncer issues
    application_name: void 0
  });
  pool.on("error", (err) => {
    console.error(
      JSON.stringify({
        msg: "postgres_pool_error",
        err: err.message,
        stack: err.stack
      })
    );
  });
  pool.on("connect", () => {
    console.log(
      JSON.stringify({
        msg: "postgres_pool_connected",
        max: config.max ?? 10
      })
    );
  });
  return pool;
}
async function closePool(pool) {
  try {
    await pool.end();
    console.log(JSON.stringify({ msg: "postgres_pool_closed" }));
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "postgres_pool_close_error",
        err: String(err)
      })
    );
    throw err;
  }
}
async function healthCheck(pool) {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { healthy: true };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      healthy: false,
      message: `Pool health check failed: ${String(err)}`
    };
  }
}

// src/kysely/db.ts
var DbClient = class {
  kysely;
  pool;
  poolMax;
  constructor(config) {
    this.poolMax = config.poolMax ?? 10;
    const poolConfig = {
      connectionString: config.connectionString,
      max: this.poolMax
    };
    this.pool = createPool(poolConfig);
    const dialect = createPostgresDialect(this.pool);
    this.kysely = new Kysely({
      dialect
    });
  }
  /**
   * Gracefully close the database connection pool.
   */
  async close() {
    await this.kysely.destroy();
    await closePool(this.pool);
  }
  /**
   * Health check: verify database connectivity.
   */
  async health() {
    return healthCheck(this.pool);
  }
  /**
   * Get pool statistics for health monitoring.
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      max: this.poolMax
    };
  }
  /**
   * Get the underlying pg.Pool (for advanced use cases).
   */
  getPool() {
    return this.pool;
  }
};
function createDbClient(config) {
  return new DbClient(config);
}

// src/kysely/tx.ts
async function withTx(db, fn) {
  return db.transaction().execute(fn);
}
async function withTxIsolation(db, isolationLevel, fn) {
  return db.transaction().setIsolationLevel(isolationLevel).execute(fn);
}

// src/adapter.ts
function createDbAdapter(config) {
  const client = new DbClient(config);
  return {
    kysely: client.kysely,
    withTx,
    withTxIsolation,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats()
  };
}

// src/kysely/query-helpers.ts
async function buildKyselyListQuery(baseQuery, params, fieldWhitelist) {
  const { filters = [], sort = [], pagination = {} } = params;
  const { page = 1, limit = 20 } = pagination;
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;
  let query = baseQuery;
  for (const filter of filters) {
    if (!fieldWhitelist.has(filter.field)) {
      throw new Error(`Invalid filter field: ${filter.field}`);
    }
    const field = filter.field;
    switch (filter.operator) {
      case "eq":
        query = query.where(field, "=", filter.value);
        break;
      case "ne":
        query = query.where(field, "!=", filter.value);
        break;
      case "gt":
        query = query.where(field, ">", filter.value);
        break;
      case "gte":
        query = query.where(field, ">=", filter.value);
        break;
      case "lt":
        query = query.where(field, "<", filter.value);
        break;
      case "lte":
        query = query.where(field, "<=", filter.value);
        break;
      case "like":
        query = query.where(field, "like", filter.value);
        break;
      case "ilike":
        query = query.where(field, "ilike", filter.value);
        break;
      case "in":
        if (!Array.isArray(filter.value)) {
          throw new Error(`IN operator requires array value`);
        }
        query = query.where(field, "in", filter.value);
        break;
      case "nin":
        if (!Array.isArray(filter.value)) {
          throw new Error(`NIN operator requires array value`);
        }
        query = query.where(field, "not in", filter.value);
        break;
      case "null":
        query = query.where(field, "is", null);
        break;
      case "nnull":
        query = query.where(field, "is not", null);
        break;
      default:
        throw new Error(`Unsupported operator: ${filter.operator}`);
    }
  }
  for (const sortCondition of sort) {
    if (!fieldWhitelist.has(sortCondition.field)) {
      throw new Error(`Invalid sort field: ${sortCondition.field}`);
    }
    const field = sortCondition.field;
    if (sortCondition.direction === "asc") {
      query = query.orderBy(field, "asc");
    } else {
      query = query.orderBy(field, "desc");
    }
  }
  const countQuery = query.clearSelect().select((eb) => eb.fn.countAll().as("count"));
  const countResult = await countQuery.executeTakeFirst();
  const total = Number(countResult?.count ?? 0);
  query = query.limit(safeLimit).offset(offset);
  const items = await query.execute();
  const totalPages = Math.ceil(total / safeLimit);
  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1
    }
  };
}
function createFieldWhitelist(fields) {
  return new Set(fields);
}
function createFieldWhitelistFromMeta(mappings) {
  return new Set(mappings.map((m) => m.dbColumnName));
}

// src/migrations/registry.ts
import { readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var MigrationRegistry = class {
  migrations = [];
  constructor() {
    this.loadMigrations();
  }
  /**
   * Get all migrations in execution order.
   */
  getAllMigrations() {
    return this.migrations;
  }
  /**
   * Get a specific migration by ID.
   */
  getMigration(id) {
    return this.migrations.find((m) => m.id === id);
  }
  /**
   * Resolve the SQL directory.
   *
   * Priority:
   *   1. ATHYPER_SQL_DIR env var — set this in all non-local environments.
   *   2. Relative fallback from this file's compiled location — works in local
   *      dev without any configuration (assumes server/framework/adapters/db/
   *      sits next to server/db/).
   */
  resolveSqlDir() {
    if (process.env.ATHYPER_SQL_DIR) {
      return resolve(process.env.ATHYPER_SQL_DIR);
    }
    return join(__dirname, "../../../../../db/sql");
  }
  /**
   * Load all SQL migrations from the filesystem.
   * Auto-detects flat-file vs subdirectory layout.
   */
  loadMigrations() {
    const sqlDir = this.resolveSqlDir();
    const entries = readdirSync(sqlDir, { withFileTypes: true });
    const flatFiles = entries.filter((e) => e.isFile() && /^\d{3}_.+\.sql$/.test(e.name)).map((e) => e.name).sort();
    if (flatFiles.length > 0) {
      this.loadFlatMigrations(sqlDir, flatFiles);
    } else {
      this.loadSubdirectoryMigrations(sqlDir, entries);
    }
  }
  /** Load from flat NNN_name.sql files. */
  loadFlatMigrations(sqlDir, files) {
    for (const fileName of files) {
      const filePath = join(sqlDir, fileName);
      const sql = readFileSync(filePath, "utf-8");
      const match = fileName.match(/^(\d{3})_(.+)\.sql$/);
      if (!match) continue;
      const [, fileNumber, name] = match;
      const id = fileName.replace(".sql", "");
      this.migrations.push({
        id,
        name,
        directory: "sql",
        fileNumber,
        sql
      });
    }
  }
  /** Load from numbered subdirectories (primary layout). */
  loadSubdirectoryMigrations(sqlDir, entries) {
    const directories = entries.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name).filter((name) => /^\d{2}_/.test(name)).sort();
    for (const dir of directories) {
      const dirPath = join(sqlDir, dir);
      const files = readdirSync(dirPath).filter((f) => f.endsWith(".sql")).sort();
      for (const file of files) {
        const filePath = join(dirPath, file);
        const sql = readFileSync(filePath, "utf-8");
        const match = file.match(/^(\d{3})_(.+)\.sql$/);
        if (!match) continue;
        const [, fileNumber, name] = match;
        const id = `${dir}/${file.replace(".sql", "")}`;
        this.migrations.push({
          id,
          name,
          directory: dir,
          fileNumber,
          sql
        });
      }
    }
  }
};
var registry;
function getMigrationRegistry() {
  if (!registry) {
    registry = new MigrationRegistry();
  }
  return registry;
}

// src/repos/core/tenant.repo.ts
async function findTenantByCode(db, code, realmKey = "athyper") {
  const row = await db.selectFrom("master.tenant as t").select(["t.id", "t.code", "t.name", "t.realm_key", "t.status"]).where("t.code", "=", code).where("t.realm_key", "=", realmKey).executeTakeFirst();
  return row;
}
async function findTenantById(db, id) {
  const row = await db.selectFrom("master.tenant as t").select(["t.id", "t.code", "t.name", "t.realm_key", "t.status"]).where("t.id", "=", id).executeTakeFirst();
  return row;
}

// src/repos/int/endpoints.repo.ts
async function findActiveEndpoints(db, service) {
  let q = db.selectFrom("int.endpoint as e").select(["e.id", "e.service", "e.path", "e.method", "e.is_active"]).where("e.is_active", "=", true);
  if (service) {
    q = q.where("e.service", "=", service);
  }
  return q.execute();
}

// src/repos/int/outbox.repo.ts
async function findUnpublishedOutboxEvents(db, limit = 100) {
  return db.selectFrom("int.outbox as o").select(["o.id", "o.event_type", "o.payload", "o.published_at", "o.created_at"]).where("o.published_at", "is", null).orderBy("o.created_at", "asc").limit(limit).execute();
}
async function markOutboxEventPublished(db, id) {
  await db.updateTable("int.outbox").set({ published_at: /* @__PURE__ */ new Date() }).where("id", "=", id).execute();
}
export {
  DbClient,
  MigrationRegistry,
  buildKyselyListQuery,
  closePool,
  createDbAdapter,
  createDbClient,
  createFieldWhitelist,
  createFieldWhitelistFromMeta,
  createPool,
  createPostgresDialect,
  findActiveEndpoints,
  findTenantByCode,
  findTenantById,
  findUnpublishedOutboxEvents,
  getMigrationRegistry,
  healthCheck,
  markOutboxEventPublished,
  withTx,
  withTxIsolation
};
//# sourceMappingURL=index.js.map
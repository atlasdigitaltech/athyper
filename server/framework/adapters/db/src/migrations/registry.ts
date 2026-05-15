// server/framework/adapters/db/src/migrations/registry.ts
// SQL directory resolution order:
//   1. ATHYPER_SQL_DIR env var (recommended in all environments)
//   2. Relative fallback from this file's location (dev convenience only)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Dirent } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Migration = {
  /**
   * Unique migration ID (e.g., "00_bootstrap/001_create_schemas")
   */
  id: string;

  /**
   * Migration name (e.g., "create_schemas")
   */
  name: string;

  /**
   * Directory prefix (e.g., "00_bootstrap")
   */
  directory: string;

  /**
   * File number (e.g., "001")
   */
  fileNumber: string;

  /**
   * SQL content
   */
  sql: string;
};

/**
 * Migration registry that discovers and loads SQL migrations from the filesystem.
 *
 * Supports two layouts:
 *
 * 1. Subdirectory layout (current):
 *    01_foundation/001_schemas.sql, 07_finance/170_budget.sql, ...
 *    Directories are named NN_group, files within as NNN_name.sql.
 *
 * 2. Flat files (legacy):  010_bootstrap.sql, 020_meta_tables.sql, ...
 *    Files are named NNN_name.sql and sorted by the numeric prefix.
 *
 * The registry auto-detects which layout is present. If flat files exist they
 * take precedence; otherwise it uses subdirectories.
 */
export class MigrationRegistry {
  private migrations: Migration[] = [];

  constructor() {
    this.loadMigrations();
  }

  /**
   * Get all migrations in execution order.
   */
  getAllMigrations(): Migration[] {
    return this.migrations;
  }

  /**
   * Get a specific migration by ID.
   */
  getMigration(id: string): Migration | undefined {
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
  private resolveSqlDir(): string {
    if (process.env.ATHYPER_SQL_DIR) {
      return resolve(process.env.ATHYPER_SQL_DIR);
    }
    // Fallback: compiled output is at dist/migrations/registry.js; traverse up
    // to server root then descend into db/sql.
    return join(__dirname, "../../../../../db/ddl");
  }

  /**
   * Load all SQL migrations from the filesystem.
   * Auto-detects flat-file vs subdirectory layout.
   */
  private loadMigrations(): void {
    const sqlDir = this.resolveSqlDir();

    const entries = readdirSync(sqlDir, { withFileTypes: true });

    // Detect flat SQL files (NNN_name.sql)
    const flatFiles = entries
      .filter((e) => e.isFile() && /^\d{3}_.+\.sql$/.test(e.name))
      .map((e) => e.name)
      .sort();

    if (flatFiles.length > 0) {
      this.loadFlatMigrations(sqlDir, flatFiles);
    } else {
      this.loadSubdirectoryMigrations(sqlDir, entries);
    }
  }

  /** Load from flat NNN_name.sql files. */
  private loadFlatMigrations(sqlDir: string, files: string[]): void {
    for (const fileName of files) {
      const filePath = join(sqlDir, fileName);
      const sql = readFileSync(filePath, "utf-8");

      const match = fileName.match(/^(\d{3})_(.+)\.sql$/);
      if (!match) continue;

      const [, fileNumber, name] = match as [string, string, string];
      const id = fileName.replace(".sql", "");

      this.migrations.push({
        id,
        name,
        directory: "sql",
        fileNumber,
        sql,
      });
    }
  }

  /** Load from numbered subdirectories (primary layout). */
  private loadSubdirectoryMigrations(sqlDir: string, entries: Dirent[]): void {
    const directories = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => /^\d{2}_/.test(name))
      .sort();

    for (const dir of directories) {
      const dirPath = join(sqlDir, dir);
      const files = readdirSync(dirPath)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const filePath = join(dirPath, file);
        const sql = readFileSync(filePath, "utf-8");

        const match = file.match(/^(\d{3})_(.+)\.sql$/);
        if (!match) continue;

        const [, fileNumber, name] = match as [string, string, string];
        const id = `${dir}/${file.replace(".sql", "")}`;

        this.migrations.push({
          id,
          name,
          directory: dir,
          fileNumber,
          sql,
        });
      }
    }
  }
}

/**
 * Singleton migration registry instance.
 */
let registry: MigrationRegistry | undefined;

/**
 * Get the global migration registry instance.
 */
export function getMigrationRegistry(): MigrationRegistry {
  if (!registry) {
    registry = new MigrationRegistry();
  }
  return registry;
}

#!/usr/bin/env node
/**
 * META Migration CLI
 *
 * Runs database migrations for entity tables generated from META definitions.
 * Uses DATABASE_ADMIN_URL for direct Postgres connection (not PgBouncer).
 *
 * Usage:
 *   pnpm meta:migrate:plan   - Generate and print migration plan
 *   pnpm meta:migrate:dev    - Auto-apply migrations (dev mode)
 *   pnpm meta:migrate:deploy - Apply migrations (prod mode)
 *   pnpm meta:migrate:sql    - Generate SQL script
 */

import Redis from "ioredis";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { createMetaServices, DdlGeneratorService, MigrationRunnerService } from "../services/platform/meta/index.js";

import type { DB } from "@athyper/adapter-db";


// Get command from args
const command = process.argv[2] || "plan";

// Validate command
const validCommands = ["plan", "dev", "deploy", "sql"];
if (!validCommands.includes(command)) {
  console.error(`Invalid command: ${command}`);
  console.error(`Valid commands: ${validCommands.join(", ")}`);
  process.exit(1);
}

// Get DATABASE_ADMIN_URL from environment
const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("ERROR: DATABASE_ADMIN_URL or DATABASE_URL must be set");
  process.exit(1);
}

// Get REDIS_URL from environment
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("ERROR: REDIS_URL must be set");
  process.exit(1);
}

// Get tenant ID (default to system tenant)
const tenantId = process.env.TENANT_ID || "00000000-0000-0000-0000-000000000000";

async function main() {
  // Assert admin URL is defined (checked above)
  if (!adminUrl || !redisUrl) {
    throw new Error("adminUrl or redisUrl not set");
  }

  console.log("META Migration Runner");
  console.log("=".repeat(80));
  console.log(`Command: ${command}`);
  console.log(`Tenant: ${tenantId}`);
  console.log(`Database: ${adminUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log("=".repeat(80));
  console.log("");

  // Create direct database connection (not PgBouncer)
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: adminUrl,
        max: 5, // Small pool for migrations
      }),
    }),
  });

  // Create Redis client for cache
  const redis = new Redis(redisUrl, { lazyConnect: true });

  try {
    // Create META services
    const metaServices = createMetaServices({ db, cache: redis });

    // Create DDL generator
    const ddlGenerator = new DdlGeneratorService();

    // Create migration runner
    const migrationRunner = new MigrationRunnerService({
      db,
      registry: metaServices.registry,
      compiler: metaServices.compiler,
      ddlGenerator,
      mode: command === "dev" ? "dev" : "prod",
    });

    // Execute command
    switch (command) {
      case "plan": {
        console.log("Generating migration plan...");
        console.log("");

        const plan = await migrationRunner.generatePlan(tenantId);
        console.log(migrationRunner.printPlan(plan));

        if (plan.filter((p) => p.action === "create").length > 0) {
          console.log("Run 'pnpm meta:migrate:dev' to apply migrations");
        } else {
          console.log("No migrations to apply");
        }
        break;
      }

      case "dev": {
        console.log("Running migrations (dev mode - auto-apply)...");
        console.log("");

        const result = await migrationRunner.runMigrations(tenantId);

        console.log("");
        console.log("Migration Results:");
        console.log("-".repeat(80));
        console.log(`  Success: ${result.success}`);
        console.log(`  Applied: ${result.appliedCount}`);
        console.log(`  Skipped: ${result.skippedCount}`);
        console.log(`  Errors: ${result.errors.length}`);
        console.log(`  Duration: ${result.durationMs.toFixed(2)}ms`);

        if (result.errors.length > 0) {
          console.log("");
          console.log("Errors:");
          for (const error of result.errors) {
            console.log(`  - ${error}`);
          }
          process.exit(1);
        }

        break;
      }

      case "deploy": {
        console.log("Running migrations (prod mode)...");
        console.log("");

        // In prod mode, first show plan
        const plan = await migrationRunner.generatePlan(tenantId);
        console.log(migrationRunner.printPlan(plan));

        const createCount = plan.filter((p) => p.action === "create").length;

        if (createCount === 0) {
          console.log("No migrations to apply");
          break;
        }

        // TODO: Add confirmation prompt for prod
        console.log("");
        console.log("Applying migrations...");

        const result = await migrationRunner.runMigrations(tenantId);

        console.log("");
        console.log("Migration Results:");
        console.log("-".repeat(80));
        console.log(`  Success: ${result.success}`);
        console.log(`  Applied: ${result.appliedCount}`);
        console.log(`  Skipped: ${result.skippedCount}`);
        console.log(`  Errors: ${result.errors.length}`);
        console.log(`  Duration: ${result.durationMs.toFixed(2)}ms`);

        if (result.errors.length > 0) {
          console.log("");
          console.log("Errors:");
          for (const error of result.errors) {
            console.log(`  - ${error}`);
          }
          process.exit(1);
        }

        break;
      }

      case "sql": {
        console.log("Generating SQL migration script...");
        console.log("");

        const plan = await migrationRunner.generatePlan(tenantId);
        const sqlScript = migrationRunner.generateSqlScript(plan);

        console.log(sqlScript);

        // Write to file
        const fs = await import("fs/promises");
        const filename = `migration-${Date.now()}.sql`;
        await fs.writeFile(filename, sqlScript, "utf-8");

        console.log("");
        console.log(`SQL script written to: ${filename}`);
        break;
      }
    }

    // Cleanup
    await db.destroy();
    redis.disconnect();

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("Migration failed:");
    console.error(error);

    await db.destroy();
    redis.disconnect();

    process.exit(1);
  }
}

main();

// Public entry for @athyper/db (keep deliberate exports)

// Main adapter interface and factory
export * from "./adapter.js";

// Kysely implementation
export * from "./kysely/db.js";
export * from "./kysely/dialect.js";
export * from "./kysely/pool.js";
export * from "./kysely/query-helpers.js";
export * from "./kysely/tx.js";

// Generated types
export type { DB } from "./generated/kysely/types.js";

// Migrations
export * from "./migrations/registry.js";
export * from "./migrations/runner.js";

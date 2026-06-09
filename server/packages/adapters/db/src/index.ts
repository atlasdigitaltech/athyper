// Public entry for @athyper/db (keep deliberate exports)

// Main adapter interface and factory
export * from "./adapter.js";

// Kysely implementation
export * from "./kysely/db.js";
export * from "./kysely/db-mesh.js";
export * from "./kysely/dialect.js";
export * from "./kysely/pool.js";
export * from "./kysely/query-helpers.js";
export * from "./kysely/tx.js";

// Generated types
export type { DB } from "./generated/kysely/types.js";
export type { DB as MeshDB } from "./generated/kysely-mesh/types.js";

// Migration registry (SQL file discovery utility)
export * from "./migrations/registry.js";

// Repos
export * from "./repos/index.js";

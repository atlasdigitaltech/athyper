// packages/shared/auth-common/src/index.ts
//
// Phase G — Public barrel for the shared auth primitives.
//
// Consumers:
//   - @athyper/runtime-server (server/src/auth/auth-pipeline.ts)
//   - @athyper/auth-bff (packages/shared/auth-bff/src/auth-pipeline.ts)
//
// Both wrap these primitives with surface-specific concerns (DB tenant
// lookup, session/redis state) and per-surface error types — but the
// algorithms and traversal helpers below are exactly the same in both
// places by construction.

export * from "./required-actions";
export * from "./roles";
export * from "./env-gates";

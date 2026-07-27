// Repo aggregator — add new repo modules here as the data layer grows.
// All repos receive a typed Kysely<DB> instance from the adapter.

export * from "./core/tenant.repo.js";
export * from "./int/endpoints.repo.js";
export * from "./int/outbox.repo.js";

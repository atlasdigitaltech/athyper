/**
 * @athyper/api-contracts — Contract Drift Checker
 *
 * CI script that verifies api-contracts schemas stay in sync
 * with server-side type definitions.
 *
 * Run: pnpm --filter @athyper/api-contracts contracts:check
 *
 * Implementation options (choose one during Sprint 1):
 *   A. Schema hash comparison against server/framework/core/meta/types
 *   B. Structural type compatibility check via ts-morph
 *   C. OpenAPI spec diff if server generates one
 *
 * See docs/api/contract-sync.md for full specification.
 */

console.log("api-contracts: drift check not yet implemented");
console.log("See docs/api/contract-sync.md for implementation options.");
process.exit(0);

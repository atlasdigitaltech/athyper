/**
 * @athyper/api-contracts
 *
 * Shared type boundary between server and frontend.
 * Zod schemas + inferred TypeScript types for all API shapes.
 *
 * CI RULE: Server metadata shape changes must revalidate these.
 * See docs/api/contract-sync.md.
 *
 * Import paths:
 *   import { ... } from "@athyper/api-contracts/common";
 *   import { ... } from "@athyper/api-contracts/metadata";
 *   import { ... } from "@athyper/api-contracts/records";
 *   import { ... } from "@athyper/api-contracts/documents";
 *   import { ... } from "@athyper/api-contracts/workflow";
 *   import { ... } from "@athyper/api-contracts/ledger";
 *   import { ... } from "@athyper/api-contracts/platform";
 *   import { queryKeys } from "@athyper/api-contracts/query-keys";
 */

export * from "./schemas/common";
export * from "./schemas/metadata";
export * from "./schemas/records";
export * from "./schemas/documents";
export * from "./schemas/workflow";
export * from "./schemas/ledger";
export * from "./schemas/platform";
export { queryKeys } from "./query-keys";

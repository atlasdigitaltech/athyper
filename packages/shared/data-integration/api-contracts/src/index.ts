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
 *   import { ... } from "@athyper/api-contracts/entity-list";
 *   import { queryKeys } from "@athyper/api-contracts/query-keys";
 */

export * from "./schemas/common";
export * from "./schemas/metadata";
export * from "./schemas/entity-cache-policy";
export * from "./schemas/meta-entity-contract-v2";
export * from "./schemas/meta-entity-contract-v21";
export * from "./schemas/meta-entity-contract-v21-upgrade";
export * from "./schemas/meta-entity-contract-versioning";
export * from "./schemas/metadata-normalizers";
export * from "./schemas/field-contract-registry-core";
export * from "./schemas/field-contract-registry";
export * from "./schemas/records";
export * from "./schemas/documents";
export * from "./schemas/document-edit-draft";
export * from "./schemas/document-edit-submit";
export * from "./schemas/document-edit-discard";
export * from "./schemas/workflow";
export * from "./schemas/ledger";
export * from "./schemas/platform";
export * from "./schemas/me";
export * from "./schemas/dashboard";
export * from "./schemas/iam";
export * from "./schemas/entity-list";
export * from "./schemas/pc-affordance-matrix";
export * from "./enums";
export { queryKeys } from "./query-keys";
export { runtimePath } from "./runtime-api-v1-paths";
export type { RuntimePathBuilder } from "./runtime-api-v1-paths";
export { runtimeServerPath } from "./runtime-server-paths";
export type { RuntimeServerPathBuilder } from "./runtime-server-paths";

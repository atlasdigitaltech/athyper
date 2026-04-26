/**
 * @athyper/runtime-shared
 *
 * Cross-runtime utilities shared between document-runtime, entity-runtime,
 * and any future domain runtime packages.
 *
 * Layer 2 — may import from Layer 0 (theme) and Layer 1 (ui).
 * Must NOT import from Layer 3 (entity-runtime) or Layer 4 (document-runtime).
 *
 * Import paths:
 *   import { fmtAmount, statusToIntent } from "@athyper/runtime-shared/core";
 *   import { relayMutate }              from "@athyper/runtime-shared/client";
 *   import { EntityPicker }             from "@athyper/runtime-shared/entity-search";
 */

export * from "./core";
export * from "./client";
export * from "./entity-search";
export * from "./renderer-registry";

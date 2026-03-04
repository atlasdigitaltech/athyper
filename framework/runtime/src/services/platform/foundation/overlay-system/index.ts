/**
 * Overlay System
 *
 * Schema Composition (Overlay & Inheritance) system for the META Engine.
 * Allows entity schemas to be composed from base + overlays with deterministic merge rules.
 */

export const moduleCode = "overlay-system";
export const moduleName = "Overlay System";

// Types
export * from "./types.js";

// Repository
export {
  type IOverlayRepository,
  InMemoryOverlayRepository,
  DatabaseOverlayRepository,
} from "./overlay.repository.js";

// Services
export { SchemaComposerService } from "./schema-composer.service.js";

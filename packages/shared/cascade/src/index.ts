/**
 * @athyper/cascade
 *
 * Shared inheritance + cascade interpretation library.
 *
 * Used by:
 *   • BFF projections (Node.js)             — projectInheritance
 *   • Form runtime (browser, framework-free) — applyCascadeDefaults, renderInheritanceChipModel, handleParentChange
 *   • Verification + reporting              — computeInheritance
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §4
 *       docs/specs/entity_field_defaults.md (future)
 */

export * from "./types.js";
export { computeInheritance, shallowEqual } from "./inheritance.js";
export { projectInheritance, projectInheritanceBatch } from "./projection.js";
export {
  applyCascadeDefaults,
  renderInheritanceChipModel,
  handleParentChange,
  type CascadeTrigger,
  type InheritanceChipModel,
  type ParentChangeAction,
} from "./runtime.js";

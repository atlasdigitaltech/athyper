/**
 * @athyper/cascade
 *
 * Shared inheritance + cascade interpretation library.
 *
 * Used by:
 *   • BFF projections (Node.js)             — projectInheritance, evaluateSourceChange
 *   • Form runtime (browser, framework-free) — applyCascadeDefaults, renderInheritanceChipModel,
 *                                              handleParentChange, evaluateSourceChange
 *   • Verification + reporting              — computeInheritance, detectCycles
 *
 * Specs:
 *   docs/specs/entity_field_defaults.md            (consolidated grammar)
 *   docs/specs/purchase_invoice_field_design.md §4
 *   docs/specs/source-change-resolver-registry.md
 */

export * from "./types";
export { computeInheritance, shallowEqual } from "./inheritance";
export { projectInheritance, projectInheritanceBatch } from "./projection";
export {
  applyCascadeDefaults,
  renderInheritanceChipModel,
  handleParentChange,
  type CascadeTrigger,
  type InheritanceChipModel,
  type ParentChangeAction,
} from "./runtime";
export {
  evaluateSourceChange,
  valuesEqual,
  type EvaluateSourceChangeArgs,
} from "./source-change";
export {
  detectCycles,
  type CycleViolation,
} from "./source-change-graph";
export {
  isResolverCode,
  asResolverCode,
  type ResolverCode,
  type ResolverContract,
  type ResolverOutputType,
} from "./resolver-contracts";

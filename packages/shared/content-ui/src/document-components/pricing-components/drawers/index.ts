/**
 * @athyper/content-ui — Purchase Invoice interactive drawers
 *
 * Add / Replace / Override drawers for pricing_component rows,
 * plus shared sub-components and helpers.
 */

export {
  DiscountDrawer,
  type DiscountDrawerProps,
  type DiscountDrawerMode,
  type ConditionTypeOption,
  type ConditionTypeCapabilities,
} from "./DiscountDrawer";

export {
  TaxDrawer,
  type TaxDrawerProps,
  type TaxDrawerMode,
  type TaxGroupOption,
  type TaxProfile,
} from "./TaxDrawer";

// Helpers
export {
  computeApportionment,
  validatePcDraft,
  resolveBaseForCalculation,
  previewComputedAmount,
  describeBasisHint,
  type ApportionmentInput,
  type ApportionmentRow,
  type ApportionmentResult,
  type ApportionmentIncompatibility,
  type PcDraft,
  type PcDraftError,
  type ComputesOnMode,
} from "./helpers";

// Shared sub-components (escape hatch for future drawers)
export {
  SectionLabel,
  SegmentedToggle,
  LockedHint,
  ReplacingBlock,
  InheritedBlock,
  SupersedeModeBanner,
  MaterialChangeWarning,
  ErrorList,
  type SegmentedToggleOption,
  type SegmentedToggleProps,
} from "./_shared";

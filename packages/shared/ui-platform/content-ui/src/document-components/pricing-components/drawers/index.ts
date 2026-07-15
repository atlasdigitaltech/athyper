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
} from "./discount-drawer";

export {
  TaxDrawer,
  type TaxDrawerProps,
  type TaxDrawerMode,
  type TaxGroupOption,
  type TaxProfile,
} from "./tax-drawer";

export {
  WhtDrawer,
  type WhtDrawerProps,
  type WhtDrawerMode,
  type WhtGroupOption,
} from "./wht-drawer";

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
  type PcValidateContext,
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
  readSegmentedFieldOptions,
  segmentedFieldLabel,
  DEFAULT_APPLY_TO_FIELD,
  type SegmentedToggleOption,
  type SegmentedToggleProps,
  type SegmentedFieldContract,
} from "./_shared";

/**
 * @athyper/content-ui — identity-v2 barrel (Phase 4)
 *
 * Reusable identity panel components for procurement + sales documents.
 * Backed by document header fields and live master joins.
 */

export { JurisdictionChip } from "./jurisdiction-chip";
export type { JurisdictionChipProps } from "./jurisdiction-chip";

export {
  AddressPicker,
  incrementAddressPickerTelemetryCounter,
  readAddressPickerTelemetryCounters,
} from "./address-picker";
export type {
  AddressCandidate,
  AddressDefaultPick,
  AddressPickerDataProvider,
  AddressPickerDataRequest,
  AddressPickerProps,
  OwnerRef,
} from "./address-picker";

export { PartyCard } from "./party-card";
export type { PartyCardProps } from "./party-card";

export { SubmitReadinessPanel } from "./submit-readiness-panel";
export type {
  SubmitReadinessPanelProps, ReadinessCheck,
} from "./submit-readiness-panel";

export { IdentityPanel, IdentityPanelV2 } from "./identity-panel-v2";
export type {
  IdentityPanelV2Props, PartySpec, AddressSummarySpec,
  ResolverCandidate, JurisdictionLookup,
} from "./identity-panel-v2";

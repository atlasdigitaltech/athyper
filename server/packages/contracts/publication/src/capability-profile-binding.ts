import { activityPolicyActions, parseActivityPolicy } from "./activity-policy.js";
import { resolveCapabilityProfileDefaults, type CapabilityProfile } from "./capability-profile.js";
import type { EntityCapabilityAuthoringMember } from "./entity-capabilities.js";
import { capabilityProfileActions } from "./common-capability-permissions.js";

/** Lower a reviewed source snapshot. No filesystem or mutable registry reads. */
export function capabilityProfileBinding(member: EntityCapabilityAuthoringMember, entityCode: string): Record<string, unknown> {
  const resolved = resolveCapabilityProfileDefaults(member, () => member.profileDefinition);
  const kind = member.capabilityKey;
  if (kind === "activity") return { schemaVersion: 1, serviceKey: "platform.activity.v1", ownerEntityCode: entityCode,
    admissionResolverKey: "platform.records.admission.v1", layouts: ["drawer", "content"],
    ...resolved.defaults, actions: activityPolicyActions(parseActivityPolicy(resolved.defaults)) };
  const actions = capabilityProfileActions(kind, Array.isArray(resolved.defaults.categories) ? resolved.defaults.categories : []);
  const shared = { schemaVersion: 1, serviceKey: `platform.${kind}.v1`, ownerEntityCode: entityCode,
    admissionResolverKey: "platform.records.admission.v1", layouts: ["drawer", "content"], actions };
  if (kind === "attachments") return { ...shared, scanRequired: true, linkKinds: ["context", "comment"],
    duplicateBehavior: "reject", unlink: "association_only", download: "short_lived_authorized_url", ...resolved.defaults };
  return { ...shared, richTextSchema: "athyper.rich-text/1.0", ...resolved.defaults,
    attachments: { ...(resolved.defaults.attachments as Record<string, unknown>), pinVersion: true, bindingRef: `${entityCode}/operation#attachmentBinding` } };
}

export interface CapabilityProfileSelection {
  readonly code: string;
  readonly version: number;
}
export interface CapabilityProfileSource {
  readonly profile?: CapabilityProfileSelection;
  /** Reviewed source content; participates in the entity contract hash. */
  readonly profileDefinition?: CapabilityProfile;
  readonly overrides?: Readonly<Record<string, unknown>>;
}

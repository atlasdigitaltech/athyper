import { PublicationContractError } from "./errors.js";
import {
  ACTIVITY_ACTIONS,
  activityPolicyActions,
  parseActivityPolicy,
  type ActivityPolicy,
} from "./activity-policy.js";
import type {
  CapabilityAction,
  CapabilityBinding,
} from "./entity-capabilities.js";

export interface ActivityBinding extends CapabilityBinding, ActivityPolicy {
  readonly notifications?: never;
  readonly actions: readonly (CapabilityAction & {
    readonly servicePermissionCode: string;
  })[];
}

/** Activity has a closed action vocabulary. Neither profiles nor entity overrides
 * may substitute permission aliases, handlers, or the parent admission resolver. */
export function parseActivityBinding(
  value: unknown,
  entityCode: string,
): ActivityBinding {
  const invalid = (message: string): never => {
    throw new PublicationContractError(
      "ENTITY_CAPABILITY_INVALID",
      `${entityCode}/operation.activityBinding: ${message}`,
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("object required");
  const v = value as Record<string, unknown>;
  const keys = [
    "schemaVersion",
    "serviceKey",
    "ownerEntityCode",
    "admissionResolverKey",
    "layouts",
    "actions",
    "profilePolicy",
    "views",
    "defaultView",
    "snapshots",
    "query",
    "recording",
    "collections",
  ];
  if (Object.keys(v).some((key) => !keys.includes(key)))
    invalid("unknown property");
  if (
    v.schemaVersion !== 1 ||
    v.serviceKey !== "platform.activity.v1" ||
    v.ownerEntityCode !== entityCode ||
    v.admissionResolverKey !== "platform.records.admission.v1"
  )
    invalid("invalid binding coordinates");
  if (
    !Array.isArray(v.layouts) ||
    v.layouts.length !== 2 ||
    !v.layouts.includes("drawer") ||
    !v.layouts.includes("content")
  )
    invalid("drawer and content layouts required");
  const policy = parseActivityPolicy({
    views: v.views,
    defaultView: v.defaultView,
    snapshots: v.snapshots,
    query: v.query,
    ...(v.recording === undefined ? {} : { recording: v.recording }),
    ...(v.collections === undefined ? {} : { collections: v.collections }),
  });
  if (
    (policy.views.includes("versions") ||
      policy.snapshots.automaticCapture !== "none") &&
    !policy.recording
  )
    invalid("authoritative transactional recording binding required");
  if (policy.recording) {
    if (
      policy.snapshots.automaticCapture === "milestone" &&
      policy.snapshots.captureOperations.some(
        (key) => !key.startsWith("transition."),
      )
    )
      invalid("milestones require explicit transition codes");
    if (
      policy.snapshots.automaticCapture === "committed" &&
      policy.snapshots.captureOperations.some(
        (key) => !policy.recording!.operations.includes(key as never),
      )
    )
      invalid("capture operation is outside recording ownership");
    if (
      policy.snapshots.automaticCapture === "milestone" &&
      !policy.recording.operations.includes("transition")
    )
      invalid("milestone requires lifecycle ownership");
  }
  const expected = activityPolicyActions(policy);
  if (!Array.isArray(v.actions) || v.actions.length !== expected.length)
    invalid("action set differs from enabled policy");
  const seen = new Set<string>();
  for (const candidate of v.actions as unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      invalid("action object required");
    const action = candidate as Record<string, unknown>;
    const canonical = expected.find((item) => item.key === action.key);
    if (
      !canonical ||
      seen.has(canonical.key) ||
      Object.keys(action).length !== Object.keys(canonical).length ||
      Object.entries(canonical).some(([key, val]) => action[key] !== val)
    )
      invalid("invalid permission/action/handler mapping");
    seen.add(canonical!.key);
  }
  if (v.profilePolicy !== undefined) {
    const ref = v.profilePolicy as Record<string, unknown>;
    if (
      !ref ||
      typeof ref !== "object" ||
      Array.isArray(ref) ||
      Object.keys(ref).sort().join() !== "artifactKey,hash,plane" ||
      typeof ref.artifactKey !== "string" ||
      !ref.artifactKey.startsWith(
        `${entityCode}/capability-profile.activity.`,
      ) ||
      typeof ref.hash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(ref.hash) ||
      typeof ref.plane !== "string" ||
      !["studio", "neon", "mesh"].includes(ref.plane)
    )
      invalid("invalid profile reference");
  }
  return Object.freeze(structuredClone(v)) as unknown as ActivityBinding;
}

export function isActivityCapabilityAction(action: {
  key: string;
  permissionCode: string;
  handlerKey: string;
}): boolean {
  if (!Object.hasOwn(ACTIVITY_ACTIONS, action.key)) return false;
  const expected =
    ACTIVITY_ACTIONS[action.key as keyof typeof ACTIVITY_ACTIONS];
  return (
    action.permissionCode === expected.permissionCode &&
    action.handlerKey === expected.handlerKey
  );
}

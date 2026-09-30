/** Safe readiness only. Never an execution token or a serialized IAM decision. */
export const entityAccessStates = [
  "allowed",
  "context_required",
  "verification_required",
  "preflight_required",
  "workflow_blocked",
  "denied",
  "not_applicable",
  "unavailable",
] as const;
export type EntityAccessState = (typeof entityAccessStates)[number];
export const entityAccessReasons = [
  "AUTHORIZED",
  "CONTEXT_REQUIRED",
  "VERIFICATION_REQUIRED",
  "PREFLIGHT_REQUIRED",
  "WORKFLOW_BLOCKED",
  "ACCESS_DENIED",
  "NOT_APPLICABLE",
  "POLICY_UNAVAILABLE",
] as const;
export interface EntityAccessDecisionV1 {
  readonly schemaVersion: 1;
  readonly state: EntityAccessState;
  readonly reasonCode: (typeof entityAccessReasons)[number];
  readonly operationKey: string;
  readonly authorityRevision: string;
  readonly decisionRef: string;
  readonly missingCoordinates?: readonly string[];
}
export function parseEntityAccessDecision(
  raw: unknown,
): EntityAccessDecisionV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new TypeError("Invalid access decision");
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "state",
          "reasonCode",
          "operationKey",
          "authorityRevision",
          "decisionRef",
          "missingCoordinates",
        ].includes(key),
    ) ||
    value.schemaVersion !== 1
  )
    throw new TypeError("Unknown access decision property/version");
  const index = entityAccessStates.indexOf(value.state as EntityAccessState);
  if (index < 0 || value.reasonCode !== entityAccessReasons[index])
    throw new TypeError("Invalid access decision state/reason");
  for (const key of ["operationKey", "authorityRevision", "decisionRef"])
    if (
      typeof value[key] !== "string" ||
      !/^[a-zA-Z0-9_.:-]{1,160}$/.test(value[key] as string)
    )
      throw new TypeError("Invalid access decision reference");
  const missing = value.missingCoordinates;
  if (value.state === "context_required") {
    if (
      !Array.isArray(missing) ||
      !missing.length ||
      missing.length > 8 ||
      new Set(missing).size !== missing.length ||
      missing.some(
        (key) =>
          ![
            "operatingOrganizationId",
            "companyCodeId",
            "workspaceId",
            "networkRelationshipId",
          ].includes(key),
      )
    )
      throw new TypeError("Invalid missing coordinates");
  } else if (missing !== undefined)
    throw new TypeError(
      "Only context-required decisions disclose missing coordinates",
    );
  return Object.freeze({
    schemaVersion: 1,
    state: value.state as EntityAccessState,
    reasonCode: entityAccessReasons[index]!,
    operationKey: value.operationKey as string,
    authorityRevision: value.authorityRevision as string,
    decisionRef: value.decisionRef as string,
    ...(missing
      ? { missingCoordinates: Object.freeze([...(missing as string[])]) }
      : {}),
  });
}

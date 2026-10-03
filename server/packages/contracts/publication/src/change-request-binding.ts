/** A source-authored case owner and flow selection, never a caller-selected target. */
export interface ChangeRequestBindingV1 {
  readonly schemaVersion: 1;
  readonly owner: "self" | "required_parent";
  readonly draftEntityCode: string;
  readonly flowArtifactKey: string;
  readonly requestKind: string;
  readonly amendmentTarget: "operation_context";
}
export function parseChangeRequestBinding(
  value: unknown,
): ChangeRequestBindingV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("CHANGE_REQUEST_BINDING_INVALID");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join() !==
      "amendmentTarget,draftEntityCode,flowArtifactKey,owner,requestKind,schemaVersion" ||
    row.schemaVersion !== 1 ||
    !["self", "required_parent"].includes(String(row.owner)) ||
    row.amendmentTarget !== "operation_context" ||
    typeof row.draftEntityCode !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(row.draftEntityCode) ||
    typeof row.flowArtifactKey !== "string" ||
    !row.flowArtifactKey.startsWith(row.draftEntityCode + "/flow.") ||
    !/^[a-z][a-z0-9_]{1,62}\/flow\.[a-z][a-z0-9_.-]{0,126}$/.test(
      row.flowArtifactKey,
    ) ||
    typeof row.requestKind !== "string" ||
    !/^[a-z][a-z0-9_.-]{0,126}$/.test(row.requestKind)
  )
    throw Error("CHANGE_REQUEST_BINDING_INVALID");
  return Object.freeze({
    schemaVersion: 1,
    owner: row.owner as ChangeRequestBindingV1["owner"],
    draftEntityCode: row.draftEntityCode,
    flowArtifactKey: row.flowArtifactKey,
    requestKind: row.requestKind,
    amendmentTarget: "operation_context",
  });
}

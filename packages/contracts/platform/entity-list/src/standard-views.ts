import { parseEntityLocalizedText, type EntityLocalizedTextV1 } from "./experience";

export interface PublishedStandardViewV1 {
  readonly key: string;
  readonly label: EntityLocalizedTextV1;
  readonly position: number;
  readonly entityCode: string;
  readonly provider: "ownership" | "recently_viewed" | "approval_tasks" | "request_documents";
  readonly ownerField?: string;
  readonly providerKey?: string;
  readonly workflowKey?: string;
  readonly approvalBinding?: {
    readonly sourceEntityCode: string;
    readonly workflowKeys: readonly string[];
    readonly workTypeCodes: readonly string[];
    readonly link: "workflow_request" | "work_item_revision";
    readonly permissionCode: string;
  };
  readonly requestBinding?: {
    readonly sourceRef: "entity_case";
    readonly requester?: "initiator_or_submitter";
    readonly operationCodes?: readonly string[];
    readonly role?: { readonly field: "requestedRole" | "roleCode"; readonly values: readonly string[] };
  };
}
export interface EffectiveStandardViewV1 { readonly key: string; readonly label: EntityLocalizedTextV1; readonly position: number; }
export function parseStandardViews(raw: unknown): readonly PublishedStandardViewV1[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new TypeError("Expected at most twenty standard views");
  const code = (value: unknown): string => { if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value)) throw new TypeError("Invalid standard-view reference"); return value; };
  const keys = new Set<string>();
  return Object.freeze(raw.map(value => {
    if (!value || typeof value !== "object") throw new TypeError("Invalid standard view");
    const item = value as Record<string, unknown>, key = code(item.key), entityCode = code(item.entityCode);
    if (key === "system" || keys.has(key)) throw new TypeError("Duplicate or reserved standard-view key"); keys.add(key);
    if (!Number.isSafeInteger(item.position) || Number(item.position) < 0) throw new TypeError("Invalid standard-view order");
    const provider = item.provider;
    if (provider !== "ownership" && provider !== "recently_viewed" && provider !== "approval_tasks" && provider !== "request_documents") throw new TypeError("Unknown standard-view provider");
    return Object.freeze({ key, entityCode, label: parseEntityLocalizedText(item.label), position: Number(item.position), provider,
      ...(provider === "ownership" ? { ownerField: code(item.ownerField) } : { providerKey: code(item.providerKey) }),
      ...(provider === "approval_tasks" ? (item.approvalBinding ? {approvalBinding: parseApprovalBinding(item.approvalBinding, code)} : { workflowKey: code(item.workflowKey) }) : {}),
      ...(provider === "request_documents" ? {requestBinding: parseRequestBinding(item.requestBinding, code)} : {}) });
  }).sort((a,b) => a.position-b.position || a.key.localeCompare(b.key)));
}

type CodeParser = (value: unknown) => string;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid standard-view binding");
  return value as Record<string, unknown>;
}
function codes(value: unknown, code: CodeParser): readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new TypeError("Expected one to fifty binding references");
  return Object.freeze([...new Set(value.map(code))]);
}
function parseApprovalBinding(raw: unknown, code: CodeParser): NonNullable<PublishedStandardViewV1["approvalBinding"]> {
  const value = object(raw);
  if (value.link !== "workflow_request" && value.link !== "work_item_revision") throw new TypeError("Invalid approval relationship");
  return Object.freeze({sourceEntityCode:code(value.sourceEntityCode), workflowKeys:codes(value.workflowKeys,code),
    workTypeCodes:codes(value.workTypeCodes,code), link:value.link, permissionCode:code(value.permissionCode)});
}
function parseRequestBinding(raw: unknown, code: CodeParser): NonNullable<PublishedStandardViewV1["requestBinding"]> {
  const value = object(raw);
  if (value.sourceRef !== "entity_case" || (value.requester !== undefined && value.requester !== "initiator_or_submitter")) throw new TypeError("Unregistered request relationship");
  const role = value.role === undefined ? undefined : object(value.role);
  if (role && role.field !== "requestedRole" && role.field !== "roleCode") throw new TypeError("Unregistered request role field");
  if (!value.requester && value.operationCodes === undefined && !role) throw new TypeError("A request view requires a constraint");
  return Object.freeze({sourceRef:"entity_case", ...(value.requester ? {requester:"initiator_or_submitter" as const}:{}),
    ...(value.operationCodes === undefined ? {} : {operationCodes:codes(value.operationCodes,code)}),
    ...(role ? {role:{field:role.field as "requestedRole"|"roleCode",values:codes(role.values,code)}}:{})});
}

export const STANDARD_VIEW_RELATIONSHIP_SOURCES = Object.freeze(["document.case_requests.v1", "workflow.actionable_documents.v1"]);

import { parseEntityDetailDescriptor, parseEntityFormDescriptor, parseEntityRecord, type EntityDetailDescriptorV1, type EntityFormDescriptorV1, type EntityRecordV1 } from "@athyper/contract-platform-entity-runtime";
import { createOperation, encodePathSegment, type HttpClient } from "@athyper/platform-api-client";

const formDescriptor = createOperation<EntityFormDescriptorV1>({ method: "GET", path: ({ entityCode }) => `/entity-runtime/${encodePathSegment(entityCode)}/form-descriptor`, parse: parseEntityFormDescriptor });
const detailDescriptor = createOperation<EntityDetailDescriptorV1>({ method: "GET", path: ({ entityCode }) => `/entity-runtime/${encodePathSegment(entityCode)}/detail-descriptor`, parse: parseEntityDetailDescriptor });
const recordRead = createOperation<EntityRecordV1>({ method: "GET", path: ({ entityCode, recordId }) => `/entity-runtime/${encodePathSegment(entityCode)}/records/${encodePathSegment(recordId)}`, parse: parseEntityRecord });
const recordCreate = createOperation<RecordMutationReceipt, Readonly<Record<string, unknown>>>({ method: "POST", path: ({ entityCode }) => `/records/${encodePathSegment(entityCode)}`, parse: parseReceipt, idempotency: "required" });
const recordPatch = createOperation<RecordMutationReceipt, Readonly<Record<string, unknown>>>({ method: "PATCH", path: ({ entityCode, recordId }) => `/records/${encodePathSegment(entityCode)}/${encodePathSegment(recordId)}`, parse: parseReceipt, idempotency: "required" });

export interface RecordMutationReceipt { readonly kind: "Committed"; readonly action: "create" | "patch"; readonly entityCode: string; readonly recordId: string; readonly version?: number; readonly replayed: boolean; }
export const entityDescriptorClient = Object.freeze({
  form: (client: HttpClient, entityCode: string, mode: "create" | "edit") => client.request(formDescriptor, { params: { entityCode }, query: { mode } }),
  detail: (client: HttpClient, entityCode: string) => client.request(detailDescriptor, { params: { entityCode } }),
  record: (client: HttpClient, entityCode: string, recordId: string) => client.request(recordRead, { params: { entityCode, recordId } }),
  create: (client: HttpClient, entityCode: string, values: Readonly<Record<string, unknown>>, idempotencyKey: string) => client.request(recordCreate, { params: { entityCode }, body: values, idempotencyKey }),
  patch: (client: HttpClient, entityCode: string, recordId: string, values: Readonly<Record<string, unknown>>, version: number, idempotencyKey: string) => client.request(recordPatch, { params: { entityCode, recordId }, body: values, headers: { "If-Match": String(version) }, idempotencyKey }),
});

function parseReceipt(value: unknown): RecordMutationReceipt { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("mutation receipt is invalid"); const item = value as Record<string, unknown>; if (item.kind !== "Committed" || (item.action !== "create" && item.action !== "patch") || typeof item.entityCode !== "string" || typeof item.recordId !== "string" || typeof item.replayed !== "boolean") throw new TypeError("mutation receipt is invalid"); const version = typeof item.version === "number" && Number.isInteger(item.version) && item.version >= 0 ? item.version : undefined; return Object.freeze({ kind: "Committed", action: item.action, entityCode: item.entityCode, recordId: item.recordId, replayed: item.replayed, ...(version === undefined ? {} : { version }) }); }

import type { EntityFieldDescriptor, EntityPolicyBindingDescriptor, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { normalizePlaneKey, type PlaneKeyInput } from "@athyper/server-foundation/context";

export interface RuntimeDescriptorRow {
  readonly entity_code: string;
  readonly release_id: string;
  readonly release_no: string | number | bigint;
  readonly entity_contract_hash: string;
  readonly plane_code: string;
  readonly compiled_hash: string;
  readonly compiled_json: unknown;
}

export function parseEntityRuntimeDescriptor(row: RuntimeDescriptorRow): EntityRuntimeDescriptor {
  const value = object(row.compiled_json, "compiled_json");
  if (value["schema"] !== "athyper.entity-runtime-descriptor/1.0") throw new Error("Unsupported entity descriptor schema");
  if (row.plane_code !== "studio" && row.plane_code !== "neon" && row.plane_code !== "mesh" && row.plane_code !== "athyper") throw new Error("Invalid entity descriptor plane");
  const planeKey = normalizePlaneKey(row.plane_code as PlaneKeyInput);
  if (value["entityCode"] !== row.entity_code || normalizePlaneKey(String(value["planeKey"]) as PlaneKeyInput) !== planeKey) throw new Error("Entity descriptor coordinate mismatch");
  const storage = object(value["storage"], "storage");
  const fields = array(value["fields"], "fields").map(parseField);
  const operationsValue = object(value["operations"], "operations");
  const operations = Object.fromEntries(Object.entries(operationsValue).map(([key, operation]) => {
    const item = object(operation, `operations.${key}`);
    return [key, { code: string(item["code"], `operations.${key}.code`), permissionCode: string(item["permissionCode"], `operations.${key}.permissionCode`) }];
  }));
  const lifecycleValue = value["lifecycle"] === undefined ? undefined : object(value["lifecycle"], "lifecycle");
  const releaseNo = Number(row.release_no);
  if (!Number.isSafeInteger(releaseNo) || releaseNo < 1) throw new Error("Invalid descriptor release number");
  return Object.freeze({
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: row.entity_code,
    planeKey,
    releaseId: row.release_id,
    releaseNo,
    contractHash: hash(row.entity_contract_hash, "contract hash"),
    compiledHash: hash(row.compiled_hash, "compiled hash"),
    storage: {
      schema: identifier(storage["schema"], "storage.schema"), object: identifier(storage["object"], "storage.object"),
      idField: identifier(storage["idField"], "storage.idField"),
      ...(storage["tenantField"] ? { tenantField: identifier(storage["tenantField"], "storage.tenantField") } : {}),
      ...(storage["versionField"] ? { versionField: identifier(storage["versionField"], "storage.versionField") } : {}),
      ...(storage["softDeleteField"] ? { softDeleteField: identifier(storage["softDeleteField"], "storage.softDeleteField") } : {}),
      ...(storage["statusField"] ? { statusField: identifier(storage["statusField"], "storage.statusField") } : {}),
    },
    fields,
    operations,
    ...(lifecycleValue ? { lifecycle: { transitions: array(lifecycleValue["transitions"], "lifecycle.transitions").map((raw) => {
      const item = object(raw, "transition");
      return { code: string(item["code"], "transition.code"), from: array(item["from"], "transition.from").map((entry) => string(entry, "transition.from")), to: string(item["to"], "transition.to"), permissionCode: string(item["permissionCode"], "transition.permissionCode") };
    }) } } : {}),
    ...(value["policyBindings"] === undefined ? {} : { policyBindings: array(value["policyBindings"], "policyBindings").map(parsePolicyBinding) }),
  });
}

function parsePolicyBinding(raw: unknown): EntityPolicyBindingDescriptor {
  const item = object(raw, "policyBinding");
  const stage = string(item["stage"], "policyBinding.stage") as EntityPolicyBindingDescriptor["stage"];
  const enforcement = string(item["enforcement"], "policyBinding.enforcement") as EntityPolicyBindingDescriptor["enforcement"];
  if (!["authorization", "precondition", "validation", "postcondition", "masking"].includes(stage)) throw new Error(`Unsupported policy binding stage: ${stage}`);
  if (!["enforce", "warn", "observe"].includes(enforcement)) throw new Error(`Unsupported policy enforcement: ${enforcement}`);
  const policyVersionNo = Number(item["policyVersionNo"]);
  const priority = Number(item["priority"]);
  if (!Number.isSafeInteger(policyVersionNo) || policyVersionNo < 1) throw new Error("Invalid policy version");
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > 32767) throw new Error("Invalid policy binding priority");
  return {
    key: code(item["key"], "policyBinding.key"), policyDefinitionId: uuid(item["policyDefinitionId"], "policyBinding.policyDefinitionId"),
    policyVersionNo, stage, enforcement, priority,
    ...(item["operationCode"] ? { operationCode: code(item["operationCode"], "policyBinding.operationCode") } : {}),
    ...(item["fieldKey"] ? { fieldKey: identifier(item["fieldKey"], "policyBinding.fieldKey") } : {}),
    inputMapping: object(item["inputMapping"], "policyBinding.inputMapping"),
  };
}

function parseField(raw: unknown): EntityFieldDescriptor {
  const item = object(raw, "field");
  const type = string(item["type"], "field.type") as EntityFieldDescriptor["type"];
  if (!["string","text","integer","decimal","boolean","date","datetime","uuid","enum","reference","json"].includes(type)) throw new Error(`Unsupported field type: ${type}`);
  const writableOn = array(item["writableOn"], "field.writableOn").map((entry) => string(entry, "field.writableOn"));
  if (writableOn.some((entry) => entry !== "create" && entry !== "patch")) throw new Error("Invalid field write mode");
  return { key: identifier(item["key"], "field.key"), storagePath: identifier(item["storagePath"], "field.storagePath"), type, required: item["required"] === true, writableOn: writableOn as ("create" | "patch")[], ...(item["filterable"] === true ? { filterable: true } : {}), ...(item["sortable"] === true ? { sortable: true } : {}), ...(item["searchable"] === true ? { searchable: true } : {}), ...(item["validation"] && typeof item["validation"] === "object" ? { validation: item["validation"] as Readonly<Record<string, unknown>> } : {}) };
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${name} must be an array`); return value; }
function string(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a string`); return value.trim(); }
function identifier(value: unknown, name: string): string { const result = string(value, name); if (!/^[a-z_][a-z0-9_]{0,62}$/.test(result)) throw new Error(`${name} must be a SQL identifier`); return result; }
function code(value: unknown, name: string): string { const result = string(value, name); if (!/^[a-z][a-z0-9_.:-]{1,126}$/.test(result)) throw new Error(`${name} must be a canonical code`); return result; }
function uuid(value: unknown, name: string): string { const result = string(value, name); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error(`${name} must be a UUID`); return result; }
function hash(value: string, name: string): string { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid ${name}`); return value; }

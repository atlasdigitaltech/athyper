import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { MutationFieldViolations } from "@athyper/server-contract-records";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";

export function validateRecordInput(descriptor: EntityRuntimeDescriptor, action: "create" | "patch", input: Readonly<Record<string, unknown>>): MutationFieldViolations {
  const fields = new Map(descriptor.fields.map((field) => [field.key, field]));
  const violations: Record<string, { code: string; message: string }[]> = {};
  for (const key of Object.keys(input)) {
    const field = fields.get(key);
    if (!field || !field.writableOn.includes(action)) add(violations, key, "FIELD_NOT_WRITABLE", "Field is not writable for this operation");
  }
  if (action === "create") {
    for (const field of descriptor.fields) if (field.required && input[field.key] === undefined) add(violations, field.key, "FIELD_REQUIRED", "Field is required");
  }
  for (const [key, value] of Object.entries(input)) {
    const field = fields.get(key);
    if (!field || value === null || value === undefined) continue;
    if (!matchesType(field.type, value)) add(violations, key, "FIELD_TYPE_INVALID", `Expected ${field.type}`);
    const config = field.validation;
    if (typeof value === "string") {
      const min = number(config?.["minLength"]); const max = number(config?.["maxLength"]); const pattern = typeof config?.["pattern"] === "string" ? config["pattern"] : undefined;
      if (min !== undefined && value.length < min) add(violations, key, "FIELD_TOO_SHORT", `Minimum length is ${min}`);
      if (max !== undefined && value.length > max) add(violations, key, "FIELD_TOO_LONG", `Maximum length is ${max}`);
      if (pattern && !new RegExp(pattern, "u").test(value)) add(violations, key, "FIELD_PATTERN_INVALID", "Field does not match its required pattern");
    }
  }
  return violations;
}

export async function validateFieldWriteAuthorization(authorizer: Authorizer, context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, input: Readonly<Record<string, unknown>>): Promise<MutationFieldViolations> {
  const fields = new Map(descriptor.fields.map((field) => [field.key, field]));
  const violations: Record<string, { code: string; message: string }[]> = {};
  await Promise.all(Object.keys(input).map(async (key) => {
    const permissionCode = fields.get(key)?.writePermissionCode;
    if (permissionCode && !(await authorizer.authorize({ context, permissionCode, resource: { entityCode: descriptor.entityCode, field: key } })).allowed) add(violations, key, "FIELD_WRITE_FORBIDDEN", "Field write is not permitted");
  }));
  return violations;
}

export function mergeFieldViolations(...sources: readonly MutationFieldViolations[]): MutationFieldViolations { const merged: Record<string, { code: string; message: string }[]> = {}; for (const source of sources) for (const [field, items] of Object.entries(source)) (merged[field] ??= []).push(...items); return merged; }

function matchesType(type: string, value: unknown): boolean {
  if (["string","text","date","datetime","uuid","enum","reference"].includes(type)) return typeof value === "string";
  if (["integer","decimal"].includes(type)) return typeof value === "number" && Number.isFinite(value) && (type !== "integer" || Number.isInteger(value));
  if (type === "boolean") return typeof value === "boolean";
  if (type === "json") return typeof value === "object";
  return false;
}
function add(target: Record<string, { code: string; message: string }[]>, field: string, code: string, message: string): void { (target[field] ??= []).push({ code, message }); }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }

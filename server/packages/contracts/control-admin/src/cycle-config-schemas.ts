type Schema = Readonly<Record<string, unknown>>;
const text = { type: "string", minLength: 1, maxLength: 256, pattern: "\\S" } as const;
const uuid = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", minLength: 36, maxLength: 36 } as const;
const object = { type: "object" } as const;
const bool = { type: "boolean" } as const;
const count = { type: "integer", minimum: 0, maximum: 2147483647 } as const;
const positive = { ...count, minimum: 1 } as const;
const hash = { type: "string", pattern: "^[a-f0-9]{64}$", minLength: 64, maxLength: 64 } as const;
const record = (properties: Record<string, Schema>, required: readonly string[]) => ({ type: "object", additionalProperties: false, required, properties });
const list = (items: Schema, maxItems = 1000) => ({ type: "array", items, maxItems });
const named = { id: uuid, code: text, name: text };
const template = record({
  cycleType: record({ ...named, domainCode: text, frequency: { enum: ["daily", "weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "annual", "adhoc"] }, cleanCyclePolicy: object, approvalPolicy: object, runDataSchema: object, taskDataSchema: object }, ["id", "code", "name", "domainCode", "frequency", "cleanCyclePolicy", "approvalPolicy", "runDataSchema", "taskDataSchema"]),
  phases: list(record({ ...named, sortOrder: count, isGateEnforced: bool, minimumReadinessPct: { type: "number", minimum: 0, maximum: 100 }, targetHoursFromStart: positive }, ["id", "code", "name", "sortOrder", "isGateEnforced"])),
  categories: list(record({ ...named, sortOrder: count }, ["id", "code", "name", "sortOrder"])),
  tasks: list(record({ ...named, phaseId: uuid, categoryId: uuid, entityCode: text, completionMode: { enum: ["manual", "system", "hybrid"] }, systemCheckHandler: text, isMandatory: bool, isWaivable: bool, sortOrder: count, applicability: object }, ["id", "phaseId", "categoryId", "entityCode", "code", "name", "completionMode", "isMandatory", "isWaivable", "sortOrder", "applicability"])),
  dependencies: list(record({ predecessorTemplateId: uuid, successorTemplateId: uuid, dependencyType: { enum: ["finish_to_start", "finish_to_finish"] }, isHard: bool }, ["predecessorTemplateId", "successorTemplateId", "dependencyType", "isHard"]), 10000),
  crossDependencies: list(record({ predecessorTypeId: uuid, predecessorPhaseId: uuid, successorTypeId: uuid, successorPhaseId: uuid, isHard: bool }, ["predecessorTypeId", "predecessorPhaseId", "successorTypeId", "successorPhaseId", "isHard"])),
  carryForwardRules: list(record({ deviationType: { enum: ["exception", "override", "waiver"] }, action: { enum: ["force_close", "auto_carry", "expire"] }, maximumCarryCount: { ...positive, maximum: 32767 }, escalateAfterCarries: { ...positive, maximum: 32767 }, targetCycleTypeId: uuid }, ["deviationType", "action"]), 100),
}, ["cycleType", "phases", "categories", "tasks", "dependencies", "crossDependencies", "carryForwardRules"]);
const revision = record({ schema: { const: "athyper.cycle-template-desired-state/1.0" }, desiredStateId: text, sourceBlueprintId: text, sourceRevision: positive, targetPlane: { enum: ["studio", "neon", "mesh"] }, tenantId: uuid, template, templateHash: hash, issuedAt: { type: "string", minLength: 1, maxLength: 64 }, signature: record({ algorithm: text, keyId: text, value: { type: "string", minLength: 1, maxLength: 4096, pattern: "\\S" } }, ["algorithm", "keyId", "value"]) }, ["schema", "desiredStateId", "sourceBlueprintId", "sourceRevision", "targetPlane", "tenantId", "template", "templateHash", "issuedAt", "signature"]);
export const cycleConfigSchemas = {
  template, revision, uuid,
  publish: record({ template, idempotencyKey: text, expectedLatestVersion: count }, ["template", "idempotencyKey"]),
  apply: record({ revision, expectedLatestVersion: count }, ["revision"]),
  latestParams: record({ cycleTypeId: uuid }, ["cycleTypeId"]),
  versionParams: record({ cycleTypeId: uuid, version: { type: "string", pattern: "^[1-9][0-9]*$", maxLength: 10 } }, ["cycleTypeId", "version"]),
} as const;

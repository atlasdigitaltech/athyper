type Schema = Readonly<Record<string, unknown>>;
const string = { type: "string" } as const;
const number = { type: "number" } as const;
const integer = { type: "integer" } as const;
const boolean = { type: "boolean" } as const;
const object = { type: "object" } as const;
const version = { type: "object", properties: { expectedVersion: integer } } as const;

const bankInput: Schema = { type: "object", required: ["countryCode", "railCode"], properties: { countryCode: string, currencyCode: string, railCode: string, accountIdentifier: string, bankIdentifier: string, bic: string, branchCode: string } };
const lookupValue: Schema = { type: "object", required: ["id", "code", "name", "sortOrder", "metadata", "status"], properties: { id: string, code: string, name: string, tenantId: string, sortOrder: integer, metadata: object, status: { type: "string", enum: ["active", "retired"] } } };
const lookupDomain: Schema = { type: "object", required: ["id", "version", "code", "name", "sourceSchema", "extensible", "values", "status"], properties: { id: string, version: integer, code: string, name: string, sourceSchema: string, extensible: boolean, values: { type: "array", items: lookupValue }, status: { type: "string", enum: ["active", "retired"] } } };
const roundingAggregate: Schema = { type: "object", required: ["code", "name", "method", "contexts", "status"], properties: { code: string, name: string, method: { type: "string", enum: ["ROUND_HALF_UP", "ROUND_HALF_EVEN", "ROUND_UP", "ROUND_DOWN", "TRUNCATE"] }, precisionDigits: integer, roundingIncrement: string, contexts: { type: "array", items: { type: "object", properties: { companyCodeId: string, currencyCode: string, slot: string } } }, status: { type: "string", enum: ["draft", "active", "suspended", "retired"] } } };
const entitlementOverride: Schema = { type: "object", required: ["planCode", "reason", "effectiveFrom"], properties: { planCode: string, moduleCode: string, limitCode: string, limitValue: number, reason: string, effectiveFrom: string, effectiveUntil: string } };
const connector: Schema = { type: "object", required: ["connectorTypeId", "code", "name", "config", "endpoints"], properties: { connectorTypeId: string, code: string, name: string, baseUrl: string, secretReference: string, config: object, endpoints: { type: "array", items: { type: "object", required: ["code", "path", "method", "kind"], properties: { code: string, path: string, method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, kind: string, requestSchema: object } } } } };
const bankRule: Schema = { type: "object", required: ["id", "version", "code", "countryCode", "railCode", "priority", "accountRequired", "bankRequired", "bicAllowed", "bicRequired", "branchRequired", "checksumValidated", "fixtures", "status"], properties: { id: string, version: integer, code: string, countryCode: string, currencyCode: string, railCode: string, priority: integer, accountRequired: boolean, bankRequired: boolean, bicAllowed: boolean, bicRequired: boolean, branchRequired: boolean, accountPattern: string, bankPattern: string, branchPattern: string, checksumValidated: boolean, fixtures: { type: "array", items: { type: "object", required: ["input", "valid"], properties: { input: bankInput, valid: boolean } } }, status: { type: "string", enum: ["draft", "active", "retired"] } } };

/** Runtime/OpenAPI schemas shared by every public control-administration route. */
export const controlAdminSchemas = Object.freeze({
  response: object, version,
  runtimeCommand: { type: "object", additionalProperties: false, required: ["commandId", "idempotencyKey", "kind", "reason", "payload"], properties: { commandId: string, idempotencyKey: string, kind: { type: "string", pattern: "^[a-z][a-z0-9_.-]{2,127}$" }, reason: string, payload: object, expectedVersion: integer, approvalId: string } },
  runtimeApprovalDecision: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: { decision: { type: "string", enum: ["approved", "rejected"] }, reason: string } },
  authorizationCommand: { type: "object", required: ["kind", "commandId", "idempotencyKey", "payload"], properties: { kind: string, commandId: string, idempotencyKey: string, payload: object, resourceId: string, expectedVersion: integer, effectiveFrom: string, effectiveUntil: string } },
  roundingSimulation: { type: "object", required: ["amount"], properties: { amount: string, companyCodeId: string, currencyCode: string, slot: string } },
  bankInput,
  featureOverride: { type: "object", required: ["enabled", "reason", "effectiveFrom"], properties: { enabled: boolean, reason: string, effectiveFrom: string, effectiveUntil: string, id: string, expectedVersion: integer } },
  parameterValue: { type: "object", required: ["value", "effectiveFrom"], properties: { effectiveFrom: string, effectiveUntil: string, reason: string, id: string, expectedVersion: integer } },
  entitlementOverride: { type: "object", required: ["override"], properties: { override: entitlementOverride, expectedVersion: integer } },
  lookupDesiredState: { type: "object", required: ["desiredStateId", "targetPlane", "sourceRevision", "domain"], properties: { desiredStateId: string, targetPlane: { type: "string", enum: ["studio", "neon", "mesh"] }, sourceRevision: integer, domain: lookupDomain } },
  roundingSave: { type: "object", required: ["aggregate"], properties: { aggregate: roundingAggregate, expectedVersion: integer } },
  bankRule,
  connectorSave: { type: "object", required: ["connector"], properties: { connector, expectedVersion: integer } },
  connector,
} satisfies Readonly<Record<string, Schema>>);

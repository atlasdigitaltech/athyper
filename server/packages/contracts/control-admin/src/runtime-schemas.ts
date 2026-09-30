type Schema = Readonly<Record<string, unknown>>;
const string = { type: "string" } as const;
const number = { type: "number" } as const;
const integer = { type: "integer" } as const;
const boolean = { type: "boolean" } as const;
const object = { type: "object" } as const;
const version = { type: "object", properties: { expectedVersion: integer } } as const;

const bankIdentifier = { type: "string", maxLength: 256 } as const;
const bankRail = { type: "string", pattern: "^[a-z][a-z0-9_.-]{1,62}$" } as const;
const bankInput: Schema = { type: "object", additionalProperties: false, required: ["countryCode", "railCode"], properties: { direction: {enum:["inbound","outbound"]},
  countryCode: { type: "string", minLength: 2, maxLength: 2, pattern: "^[A-Za-z]{2}$" }, currencyCode: { type: "string", minLength: 3, maxLength: 3, pattern: "^[A-Za-z]{3}$" }, railCode: bankRail,
  accountIdentifier: bankIdentifier, bankIdentifier, bic: bankIdentifier, branchCode: bankIdentifier,
} };
const parameterCode={type:"string",minLength:1,maxLength:128,pattern:"^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"} as const;
const parameterId={type:"string",minLength:1,maxLength:128,pattern:"^\\S+$"} as const;
const parameterVersion={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER} as const;
const parameterDate={type:"string",minLength:1,maxLength:64} as const;
const parameterReason={type:"string",minLength:1,maxLength:2000,pattern:"\\S"} as const;
const parameterDefinition={type:"object",additionalProperties:false,required:["id","revision","code","valueType","defaultValue","tenantCanOverride","reloadMode","cacheTtlSeconds","status"],properties:{
 revision:{type:"integer",minimum:1,maximum:2147483647},id:parameterId,code:parameterCode,valueType:{enum:["boolean","integer","number","string","enum","duration","json"]},defaultValue:{},minValue:number,maxValue:number,allowedValues:{type:"array",items:{}},tenantCanOverride:boolean,
 reloadMode:{enum:["immediate","next_request","next_login","restart","external_provider"]},cacheTtlSeconds:{type:"integer",minimum:0,maximum:86400},status:{enum:["active","retired"]}}} as const;
const parameterRecord={type:"object",additionalProperties:false,required:["id","version","tenantId","parameterDefinitionId","value","effectiveFrom","status"],properties:{id:parameterId,version:{...parameterVersion,minimum:1},tenantId:parameterId,parameterDefinitionId:parameterId,value:{},reason:parameterReason,effectiveFrom:parameterDate,effectiveUntil:parameterDate,status:{enum:["active","expired"]}}} as const;
const lookupCode = {type:"string",minLength:1,maxLength:128,pattern:"^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$"} as const;
const lookupId = {type:"string",minLength:1,maxLength:128,pattern:"\\S"} as const;
const lookupRevision = {type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER} as const;
const lookupName = {type:"string",minLength:1,maxLength:256,pattern:"\\S"} as const;
const lookupValue: Schema = {type:"object",additionalProperties:false,required:["id","code","name","sortOrder","metadata","status"],properties:{
  id:lookupId,code:lookupCode,name:lookupName,tenantId:lookupId,sortOrder:{type:"integer",minimum:-32768,maximum:32767},metadata:object,status:{enum:["active","retired"]}}};
const lookupDomain: Schema = {type:"object",additionalProperties:false,required:["id","version","code","name","sourceSchema","extensible","values","status"],properties:{
  id:lookupId,version:lookupRevision,code:lookupCode,name:lookupName,sourceSchema:{type:"string",minLength:1,maxLength:63,pattern:"^[a-z][a-z0-9_]*$"},
  extensible:boolean,values:{type:"array",maxItems:10000,items:lookupValue},status:{enum:["active","retired"]}}};
const roundingText={type:"string",minLength:1,maxLength:128,pattern:"^\\S(?:.*\\S)?$"} as const;
const roundingContext={type:"object",additionalProperties:false,properties:{companyCodeId:roundingText,currencyCode:{type:"string",pattern:"^[A-Z]{3}$"},slot:roundingText}} as const;
const roundingAggregate: Schema = { type:"object",additionalProperties:false,required:["code","name","method","contexts","status"],properties:{code:roundingText,name:{...roundingText,maxLength:256},method:{enum:["ROUND_HALF_UP","ROUND_HALF_EVEN","ROUND_UP","ROUND_DOWN","TRUNCATE"]},precisionDigits:{type:"integer",minimum:0,maximum:6},roundingIncrement:{type:"string",pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$",maxLength:19},contexts:{type:"array",minItems:1,maxItems:256,items:roundingContext},status:{enum:["draft","active","suspended","retired"]}}};
const roundingRecord:Schema={...roundingAggregate,required:["id","tenantId","version",...roundingAggregate.required as string[]],properties:{...roundingAggregate.properties as object,id:roundingText,tenantId:roundingText,version:{type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER}}};
const entitlementCode = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" } as const;
const entitlementDate = { type: "string", minLength: 1, maxLength: 64 } as const;
const entitlementVersion = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const entitlementOverride = { type: "object", additionalProperties: false, required: ["planCode", "reason", "effectiveFrom"], properties: {
  planCode: entitlementCode, moduleCode: entitlementCode, limitCode: entitlementCode, limitValue: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  reason: { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" }, effectiveFrom: entitlementDate, effectiveUntil: entitlementDate,
}, oneOf: [
  { required: ["moduleCode"], not: { anyOf: [{ required: ["limitCode"] }, { required: ["limitValue"] }] } },
  { required: ["limitCode", "limitValue"], not: { required: ["moduleCode"] } },
] } as const;
const entitlementPlan = { type: "object", additionalProperties: false, required: ["code", "version", "modules", "limits", "effectiveFrom"], properties: {
  code: entitlementCode, version: { ...entitlementVersion, minimum: 1 }, modules: { type: "array", items: entitlementCode },
  limits: { type: "object", additionalProperties: { anyOf: [{ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, { type: "null" }] } }, effectiveFrom: entitlementDate, effectiveUntil: entitlementDate,
} } as const;
const featureCode = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" } as const;
const featureProperties = { enabled: { type: "boolean" }, reason: {type:"string",minLength:1,maxLength:2000,pattern:"\\S"},
  effectiveFrom: entitlementDate, effectiveUntil: entitlementDate, id: featureCode, expectedVersion: entitlementVersion } as const;
const featureDefinition = {type:"object",additionalProperties:false,required:["id","code","defaultEnabled","status","effectiveFrom","cohortStrategy","cohortRevision"],properties:{
  cohortStrategy:{enum:["tenant_sha256_v1","principal_fnv1a_v2"]},cohortRevision:{type:"integer",minimum:1},id:featureCode,code:featureCode,defaultEnabled:{type:"boolean"},rolloutPct:{type:"integer",minimum:0,maximum:100},status:{enum:["active","retired"]},
  effectiveFrom:entitlementDate,effectiveUntil:entitlementDate,kind:{enum:["release_gate","kill_switch","experiment"]}}} as const;
const featureRecord = {type:"object",additionalProperties:false,required:["id","tenantId","featureFlagId","enabled","reason","effectiveFrom","version","status"],properties:{
  id:featureCode,tenantId:featureCode,featureFlagId:featureCode,enabled:featureProperties.enabled,reason:featureProperties.reason,effectiveFrom:entitlementDate,effectiveUntil:entitlementDate,
  version:{...entitlementVersion,minimum:1},status:{enum:["active","expired"]}}} as const;
const connectorId = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$" } as const;
const connectorVersion = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const connectorProperties = {
  id: connectorId, connectorTypeId: connectorId, code: { type: "string", pattern: "^[A-Z][A-Z0-9_.-]{1,62}$", maxLength: 63 },
  name: { type: "string", minLength: 1, maxLength: 256, pattern: "\\S" },
  baseUrl: { type: "string", minLength: 1, maxLength: 2048 }, secretReference: { type: "string", minLength: 1, maxLength: 2048 }, config: object,
  endpoints: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["code", "path", "method", "kind"], properties: {
    code: connectorId, path: { type: "string", minLength: 1, maxLength: 2048 }, method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, kind: connectorId, requestSchema: object,
  } } }, status: { type: "string", enum: ["draft", "active", "suspended", "deprecated"] },
} as const;
const connector = { type: "object", additionalProperties: false, required: ["connectorTypeId", "code", "name", "config", "endpoints"], properties: connectorProperties } as const;
const bankRule: Schema = { type: "object", additionalProperties: false, required: ["id", "version", "code", "countryCode", "railCode", "priority", "accountRequired", "bankRequired", "bicAllowed", "bicRequired", "branchRequired", "checksumValidated", "fixtures", "status"], properties: {
  direction: {enum:["inbound","outbound","both"]}, name: {type:"string",minLength:1,maxLength:256}, accountIdentifierType: {type:"string",pattern:"^[a-z][a-z0-9_]{1,62}$"}, bankIdentifierType: {type:"string",pattern:"^[a-z][a-z0-9_]{1,62}$"},
  id: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S" }, version: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  code: { type: "string", pattern: "^[A-Z][A-Z0-9_.-]{1,62}$" }, countryCode: { type: "string", minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$" }, currencyCode: { type: "string", minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" }, railCode: bankRail,
  priority: { type: "integer", minimum: 0, maximum: 32767 }, accountRequired: boolean, bankRequired: boolean, bicAllowed: boolean, bicRequired: boolean, branchRequired: boolean,
  accountPattern: { type: "string", minLength: 1, maxLength: 1024 }, bankPattern: { type: "string", minLength: 1, maxLength: 1024 }, branchPattern: { type: "string", minLength: 1, maxLength: 1024 }, checksumValidated: boolean,
  fixtures: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["input", "valid"], properties: { input: bankInput, valid: boolean } } }, status: { type: "string", enum: ["draft", "active", "retired"] },
} };

/** Runtime/OpenAPI schemas shared by every public control-administration route. */
const runtimeText={type:"string",minLength:1,maxLength:256,pattern:"^\\S(?:[\\s\\S]*\\S)?$"} as const;
const runtimeReason={...runtimeText,maxLength:2000};
const runtimeHash={type:"string",pattern:"^[a-f0-9]{64}$"} as const;
const runtimeApproval={type:"object",additionalProperties:false,required:["approvalId","commandId","commandFingerprint","requestedBy","requestedAt","status"],properties:{approvalId:runtimeText,commandId:runtimeText,commandFingerprint:runtimeHash,previewFingerprint:runtimeHash,requestedBy:runtimeText,requestedAt:string,status:{enum:["pending","approved","rejected"]},decidedBy:runtimeText,decidedAt:string,decisionReason:runtimeReason}} as const;
const runtimeSubmission={type:"object",additionalProperties:false,required:["outcome","commandId","fingerprint"],properties:{outcome:{enum:["approval_required","pending","applied","failed","replayed"]},commandId:runtimeText,fingerprint:runtimeHash,approval:runtimeApproval,value:{}}} as const;
const runtimePreview={type:"object",additionalProperties:false,required:["commandId","fingerprint","risk","approvalRequired","current","proposed","diff","warnings"],properties:{commandId:runtimeText,fingerprint:runtimeHash,risk:{enum:["low","medium","high","critical"]},approvalRequired:boolean,current:{},proposed:{},warnings:{type:"array",maxItems:100,items:{type:"string",maxLength:2000}},diff:{type:"array",items:{type:"object",additionalProperties:false,required:["operation","path"],properties:{operation:{enum:["add","remove","replace"]},path:string,before:{},after:{}}}}}} as const;
const runtimeHistoryEntry={type:"object",additionalProperties:false,required:["historyId","commandId","kind","event","planeKey","tenantId","actorId","reason","fingerprint","detail","occurredAt","entryHash"],properties:{historyId:runtimeText,commandId:runtimeText,kind:runtimeText,event:{enum:["submitted","approval_requested","approved","rejected","applied"]},planeKey:{enum:["studio","neon","mesh"]},tenantId:runtimeText,actorId:runtimeText,reason:runtimeReason,fingerprint:runtimeHash,detail:object,occurredAt:string,previousHash:runtimeHash,entryHash:runtimeHash}} as const;

export const controlAdminSchemas = Object.freeze({
  response: object, version,
  runtimePreview,runtimeSubmission,runtimeApproval,
  runtimeHistory:{type:"array",maxItems:200,items:runtimeHistoryEntry},
  runtimeHistoryQuery:{type:"object",additionalProperties:false,properties:{limit:{type:"string",pattern:"^[1-9][0-9]{0,2}$",maxLength:3}}},
  runtimeApprovalParams:{type:"object",additionalProperties:false,required:["id"],properties:{id:runtimeText}},
  runtimeCommand: { type: "object", additionalProperties: false, required: ["commandId", "idempotencyKey", "kind", "reason", "payload"], properties: { commandId: runtimeText, idempotencyKey: runtimeText, kind: { type: "string", pattern: "^[a-z][a-z0-9_.-]{2,127}$" }, reason: runtimeReason, payload: object, expectedVersion: {type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER}, approvalId: runtimeText } },
  runtimeApprovalDecision: { type: "object", additionalProperties: false, required: ["decision", "reason"], properties: { decision: { type: "string", enum: ["approved", "rejected"] }, reason: runtimeReason } },
  authorizationCommand: { type: "object", required: ["kind", "commandId", "idempotencyKey", "payload"], properties: { kind: string, commandId: string, idempotencyKey: string, payload: object, resourceId: string, expectedVersion: integer, effectiveFrom: string, effectiveUntil: string } },
  roundingSimulation: {type:"object",additionalProperties:false,required:["amount"],properties:{...roundingContext.properties,amount:{type:"string",pattern:"^-?[0-9]{1,38}(\\.[0-9]{1,18})?$",maxLength:58}}},
  roundingRecord,
  roundingRecords:{type:"array",items:roundingRecord},
  roundingIdParams:{type:"object",additionalProperties:false,required:["id"],properties:{id:roundingText}},
  roundingRetire:{type:"object",additionalProperties:false,required:["expectedVersion"],properties:{expectedVersion:{type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER}}},
  roundingResult:{type:"object",additionalProperties:false,required:["input","output","ruleId","ruleCode","specificity"],properties:{input:string,output:string,ruleId:roundingText,ruleCode:roundingText,specificity:{type:"integer",minimum:0,maximum:7}}},
  bankInput,
  bankRules: { type: "array", items: bankRule },
  bankResult: { type: "object", additionalProperties: false, required: ["valid", "issues"], properties: { valid: boolean, ruleId: string, issues: { type: "array", items: string } } },
  featureOverride: { type: "object", additionalProperties:false, required: ["enabled", "reason", "effectiveFrom", "expectedVersion"], properties: featureProperties,
    allOf:[{if:{properties:{expectedVersion:{minimum:1}}},then:{required:["id"]}}] },
  featureCodeParams: {type:"object",additionalProperties:false,required:["code"],properties:{code:featureCode}},
  featureIdParams: {type:"object",additionalProperties:false,required:["id"],properties:{id:featureCode}},
  featureVersion: {type:"object",additionalProperties:false,required:["expectedVersion"],properties:{expectedVersion:{...entitlementVersion,minimum:1}}},
  featureDefinitions: {type:"array",items:featureDefinition},
  featureRecord,
  featureEvaluation: {type:"object",additionalProperties:false,required:["code","enabled","source","definition"],properties:{code:featureCode,enabled:{type:"boolean"},source:{enum:["catalog","tenant_override"]},definition:featureDefinition,override:featureRecord}},
  parameterValue:{type:"object",additionalProperties:false,required:["value","effectiveFrom","expectedVersion"],properties:{value:{},effectiveFrom:parameterDate,effectiveUntil:parameterDate,reason:parameterReason,id:parameterId,expectedVersion:parameterVersion},allOf:[{if:{properties:{expectedVersion:{minimum:1}},required:["expectedVersion"]},then:{required:["id"]}}]},
  parameterDefinition,
  parameterDefinitions:{type:"array",items:parameterDefinition},
  parameterRecord,
  parameterEffective:{type:"object",additionalProperties:false,required:["code","value","reloadMode","cacheTtlSeconds","source","configurationRevision","overrideVersion"],properties:{overrideId:parameterId,overrideVersion:parameterVersion,configurationRevision:{type:"string",minLength:1},code:parameterCode,value:{},reloadMode:parameterDefinition.properties.reloadMode,cacheTtlSeconds:parameterDefinition.properties.cacheTtlSeconds,source:{enum:["default","tenant_override"]}}},
  parameterCodeParams:{type:"object",additionalProperties:false,required:["code"],properties:{code:parameterCode}},
  parameterIdParams:{type:"object",additionalProperties:false,required:["id"],properties:{id:parameterId}},
  parameterExpire:{type:"object",additionalProperties:false,required:["expectedVersion"],properties:{expectedVersion:{...parameterVersion,minimum:1}}},
  entitlementOverride: { type: "object", additionalProperties: false, required: ["override", "expectedVersion"], properties: { override: entitlementOverride, expectedVersion: entitlementVersion } },
  entitlementOverrideValue: entitlementOverride,
  entitlementVersion: { type: "object", additionalProperties: false, required: ["expectedVersion"], properties: { expectedVersion: { ...entitlementVersion, minimum: 1 } } },
  entitlementParams: { type: "object", additionalProperties: false, required: ["id"], properties: { id: entitlementCode } },
  entitlementPlans: { type: "array", items: entitlementPlan },
  entitlementModules: { type: "array", items: entitlementCode },
  entitlementRecord: { ...entitlementOverride, required: [...entitlementOverride.required, "id", "tenantId", "version", "status"], properties: { ...entitlementOverride.properties, id: entitlementCode, tenantId: entitlementCode, version: { ...entitlementVersion, minimum: 1 }, status: { enum: ["active", "expired"] } } },
  lookupDesiredState: {type:"object",additionalProperties:false,required:["desiredStateId","targetPlane","sourceRevision","domain"],properties:{desiredStateId:lookupId,targetPlane:{enum:["studio","neon","mesh"]},sourceRevision:lookupRevision,domain:lookupDomain}},
  lookupDomain,
  lookupDomains: {type:"array",items:lookupDomain},
  lookupCodeParams: {type:"object",additionalProperties:false,required:["code"],properties:{code:lookupCode}},
  lookupValueParams: {type:"object",additionalProperties:false,required:["code","valueCode"],properties:{code:lookupCode,valueCode:lookupCode}},
  lookupQuery: {type:"object",additionalProperties:false,properties:{version:{type:"string",pattern:"^[1-9][0-9]*$",maxLength:16}}},
  lookupVersion: {type:"object",additionalProperties:false,required:["expectedVersion"],properties:{expectedVersion:lookupRevision}},
  roundingSave: {type:"object",additionalProperties:false,required:["aggregate","expectedVersion"],properties:{aggregate:roundingAggregate,expectedVersion:{type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER}}},
  bankRule,
  connectorSave: { type: "object", additionalProperties: false, required: ["connector", "expectedVersion"], properties: { connector: { ...connector, properties: { ...connectorProperties, status: { const: "draft" } } }, expectedVersion: connectorVersion } },
  connectorVersion: { type: "object", additionalProperties: false, required: ["expectedVersion"], properties: { expectedVersion: { ...connectorVersion, minimum: 1 } } },
  connectorParams: { type: "object", additionalProperties: false, required: ["id"], properties: { id: connectorId } },
  connectorRecord: { ...connector, required: [...connector.required, "id", "tenantId", "version", "status"], properties: { ...connectorProperties, tenantId: connectorId, version: { ...connectorVersion, minimum: 1 } } },
  connectorValidation: { type: "object", additionalProperties: false, required: ["valid"], properties: { valid: { const: true } } },
  connectorHealthJob: { type: "object", additionalProperties: false, required: ["jobId"], properties: { jobId: { type: "string", minLength: 1, pattern: "\\S" } } },
  connector,
} satisfies Readonly<Record<string, Schema>>);

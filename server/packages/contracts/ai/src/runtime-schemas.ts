type Schema = Readonly<Record<string, unknown>>;
const string = { type: "string" } as const, number = { type: "number" } as const, boolean = { type: "boolean" } as const, object = { type: "object" } as const;
export const atlasAdminSchemas = Object.freeze({
  response: object,
  credential: { type: "object", required: ["secret"], properties: { secret: string } },
  knowledgeSource: { type: "object", required: ["sourceKind", "sourceId", "permissionCode"], properties: { sourceKind: string, sourceId: string, permissionCode: string, entityCode: string } },
  retractSource: { type: "object", required: ["sourceId"], properties: { sourceId: string, delete: boolean } },
  actionPolicy: { type: "object", required: ["actionCode", "autonomyLevel", "requiresHumanConfirmation"], properties: { actionCode: string, docClass: string, autonomyLevel: { type: "string", enum: ["disabled", "suggest", "assist", "auto"] }, minConfidenceForAuto: number, requiresHumanConfirmation: boolean, expectedRevision: string } },
  confidenceThreshold: { type: "object", required: ["actionCode", "minForSuggest", "minForAssist", "minForAuto", "driftWindowHours"], properties: { actionCode: string, docClass: string, modelId: string, minForSuggest: number, minForAssist: number, minForAuto: number, driftAlertBelow: number, driftWindowHours: number, expectedRevision: string } },
  quotaPolicy: { type: "object", required: ["maxRequests", "maxInputTokens", "maxOutputTokens", "windowSeconds"], properties: { maxRequests: number, maxInputTokens: number, maxOutputTokens: number, windowSeconds: number } },
  dashboardQuery: { type: "object", properties: { windowHours: string } },
} satisfies Readonly<Record<string, Schema>>);

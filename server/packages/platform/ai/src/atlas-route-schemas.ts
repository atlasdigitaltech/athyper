import type { RouteContract } from "@athyper/server-runtime-http";

const text = { type: "string", minLength: 1, pattern: "\\S" } as const;
const uuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
} as const;
const integer = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;
const queryInteger = { type: "string", pattern: "^(0|[1-9][0-9]*)$" } as const;
const title = { ...text, maxLength: 200 };
const object = { type: "object" } as const;
const version = {
  type: "object",
  required: ["expectedRowVersion"],
  properties: { expectedRowVersion: integer },
};
const body = (properties: Record<string, unknown>, required: string[]) => ({
  body: { type: "object", properties, required },
});

export const atlasRequests: Readonly<Record<string, RouteContract["request"]>> =
  {
    "atlas.createThread": body({ title }, []),
    "atlas.listThreads": {
      query: {
        type: "object",
        properties: {
          status: { enum: ["active", "archived", "all"] },
          limit: queryInteger,
          cursor: text,
        },
      },
    },
    "atlas.listThreadMessages": {
      query: {
        type: "object",
        properties: { limit: queryInteger, beforeSequence: queryInteger },
      },
    },
    "atlas.renameThread": body({ title, expectedRowVersion: integer }, [
      "title",
      "expectedRowVersion",
    ]),
    "atlas.archiveThread": { body: version },
    "atlas.deleteThread": { body: version },
    "atlas.putThreadParticipant": body(
      { role: { enum: ["member", "observer"] }, expectedRowVersion: integer },
      ["role", "expectedRowVersion"],
    ),
    "atlas.revokeThreadParticipant": { body: version },
    "atlas.runThread": body(
      {
        clientRequestId: text,
        publicModelId: text,
        dataClass: text,
        userText: text,
        catalogPolicyRevision: text,
        agentCode: text,
        attachmentContextId: uuid,
        attachmentIds: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: uuid,
        },
      },
      [
        "clientRequestId",
        "publicModelId",
        "dataClass",
        "userText",
        "catalogPolicyRevision",
      ],
    ),
    "atlas.listToolHistory": {
      query: { type: "object", properties: { limit: queryInteger } },
    },
    "atlas.previewTool": body(
      {
        threadId: uuid,
        runId: uuid,
        callId: text,
        toolCode: text,
        toolVersion: text,
        arguments: object,
        summary: text,
        affectedEntityType: text,
        affectedEntityId: uuid,
        expectedRowVersion: integer,
      },
      [
        "threadId",
        "runId",
        "callId",
        "toolCode",
        "toolVersion",
        "arguments",
        "summary",
      ],
    ),
    "atlas.cancelTool": body({ reason: { ...text, maxLength: 128 } }, []),
    "atlas.runTool": body({ arguments: object, confirmationToken: text }, [
      "arguments",
    ]),
  };

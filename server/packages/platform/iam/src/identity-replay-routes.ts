import type { Application, RequestHandler } from "express";
import {
  defineRouteContract,
  HttpError,
  registerContractRoute,
  type JsonSchema,
} from "@athyper/server-runtime-http";
import { readVerifiedRequestContext } from "./iam-routes.js";
import {
  IdentityReplayError,
  type IdentityReplayApprovalService,
} from "./identity-replay-approval.js";
const uuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
};
const reason = { type: "string", minLength: 1, maxLength: 1000 };
const reasonBody = {
  type: "object",
  additionalProperties: false,
  properties: { reason },
  required: ["reason"],
};
function contract(
  method: "get" | "post",
  path: string,
  options: {
    id: string;
    summary: string;
    key: string;
    body?: JsonSchema;
    status: number;
  },
) {
  return {
    ...options,
    definition: defineRouteContract({
      method,
      path,
      operationId: options.id,
      summary: options.summary,
      tags: ["IAM"],
      authenticated: true,
      permission: `studio.iam.application_projection.${method === "get" ? "read" : "replay"}`,
      request: {
        params: {
          type: "object",
          properties: { [options.key]: uuid },
          required: [options.key],
        },
        ...(options.body ? { body: options.body } : {}),
      },
      responses: {
        [options.status]: { description: "Success", body: { type: "object" } },
        400: { description: "Invalid input" },
        401: { description: "Authentication required" },
        403: { description: "Authority, MFA or separation rejected" },
        404: { description: "Evidence not found" },
        409: {
          description: "Expired, revoked, consumed or superseded evidence",
        },
        503: { description: "Replay disabled or authority unavailable" },
      },
    }),
  };
}
export function registerIdentityReplayRoutes(
  app: Application,
  authenticate: RequestHandler,
  service: IdentityReplayApprovalService,
): void {
  const routes = [
    contract(
      "post",
      "/api/iam/identity-saga-attempts/:attemptId/replay-approvals",
      {
        id: "iam.requestIdentityReplayApproval",
        summary: "Request durable approval for an exact identity saga attempt",
        key: "attemptId",
        status: 201,
        body: {
          ...reasonBody,
          properties: {
            reason,
            ttlSeconds: { type: "integer", minimum: 60, maximum: 3600 },
          },
        },
      },
    ),
    contract("get", "/api/iam/identity-replay-approvals/:approvalId", {
      id: "iam.readIdentityReplayApproval",
      summary: "Read durable identity replay approval evidence",
      key: "approvalId",
      status: 200,
    }),
    contract("post", "/api/iam/identity-replay-approvals/:approvalId/approve", {
      id: "iam.approveIdentityReplayApproval",
      summary:
        "Approve identity replay as an independent authenticated reviewer",
      key: "approvalId",
      status: 200,
      body: reasonBody,
    }),
    contract("post", "/api/iam/identity-replay-approvals/:approvalId/revoke", {
      id: "iam.revokeIdentityReplayApproval",
      summary: "Revoke identity replay approval",
      key: "approvalId",
      status: 200,
      body: reasonBody,
    }),
    contract("post", "/api/iam/identity-saga-attempts/:attemptId/replay", {
      id: "iam.replayIdentitySaga",
      summary:
        "Atomically consume durable approval and request identity saga replay",
      key: "attemptId",
      status: 202,
      body: {
        type: "object",
        additionalProperties: false,
        properties: { approvalId: uuid },
        required: ["approvalId"],
      },
    }),
  ];
  for (const route of routes)
    registerContractRoute(
      app,
      route.definition,
      authenticate,
      async (request, response, next) => {
        response.setHeader("Cache-Control", "private, no-store");
        try {
          const context = readVerifiedRequestContext(response);
          const id = String(request.params[route.key]);
          if (route.id === "iam.requestIdentityReplayApproval")
            response.status(201).json(
              await service.create(context, {
                attemptId: id,
                reason: request.body.reason,
                ttlSeconds: request.body.ttlSeconds,
              }),
            );
          else if (route.id === "iam.readIdentityReplayApproval")
            response.status(200).json(await service.read(context, id));
          else if (route.id === "iam.replayIdentitySaga") {
            await service.replay(context, {
              attemptId: id,
              approvalId: request.body.approvalId,
            });
            response.status(202).json({ accepted: true, attemptId: id });
          } else
            response.status(200).json(
              await service.decide(context, {
                approvalId: id,
                decision:
                  route.id === "iam.approveIdentityReplayApproval"
                    ? "approve"
                    : "revoke",
                reason: request.body.reason,
              }),
            );
        } catch (error) {
          next(
            error instanceof IdentityReplayError
              ? new HttpError(error.status, error.code, error.code)
              : error,
          );
        }
      },
    );
}

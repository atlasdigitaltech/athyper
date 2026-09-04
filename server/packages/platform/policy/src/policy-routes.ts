import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { PolicyService } from "@athyper/server-contract-policy";
import type { Application, RequestHandler, Response } from "express";
import { PolicyRouteError } from "./errors.js";
import type { ExplainablePolicyService } from "./policy-service.js";

export interface PolicyRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer;
  readonly policy: PolicyService & Partial<ExplainablePolicyService>;
}

export function registerPolicyRoutes(
  application: Application,
  options: PolicyRouteOptions,
): void {
  application.post(
    "/api/policy/evaluate",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const authorization = await options.authorizer.authorize({
          context,
          permissionCode: "policy.evaluate",
        });
        if (!authorization.allowed) {
          response.status(403).json({
            error: "FORBIDDEN",
            message: "Policy evaluation is not permitted",
          });
          return;
        }
        const value = body(request.body);
        const entityId = optionalText(value, "entityId");
        const policyDefinitionIds = uuidArray(value["policyDefinitionIds"]);
        const pipelineId = optionalText(value, "pipelineId");
        const decision = await options.policy.evaluate({
          context,
          entityType: requiredText(value, "entityType"),
          ...(entityId ? { entityId } : {}),
          facts: object(value["facts"]),
          ...(policyDefinitionIds ? { policyDefinitionIds } : {}),
          ...(pipelineId ? { pipelineId } : {}),
        });
        response.status(200).json(decision);
      } catch (error) {
        if (error instanceof PolicyRouteError)
          response
            .status(error.statusCode)
            .json({ error: error.code, message: error.message });
        else next(error);
      }
    },
  );
  application.post(
    "/api/policy/simulate",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const authorization = await options.authorizer.authorize({
          context,
          permissionCode: "policy.simulate",
        });
        if (!authorization.allowed) {
          response.status(403).json({
            error: "FORBIDDEN",
            message: "Policy simulation is not permitted",
          });
          return;
        }
        if (!options.policy.simulate) {
          response.status(501).json({ error: "POLICY_SIMULATION_UNAVAILABLE" });
          return;
        }
        const value = body(request.body),
          entityId = optionalText(value, "entityId"),
          policyDefinitionIds = uuidArray(value["policyDefinitionIds"]),
          pipelineId = optionalText(value, "pipelineId");
        response.status(200).json(
          await options.policy.simulate({
            context,
            entityType: requiredText(value, "entityType"),
            ...(entityId ? { entityId } : {}),
            facts: object(value["facts"]),
            ...(policyDefinitionIds ? { policyDefinitionIds } : {}),
            ...(pipelineId ? { pipelineId } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof PolicyRouteError)
          response
            .status(error.statusCode)
            .json({ error: error.code, message: error.message });
        else next(error);
      }
    },
  );
}

function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PolicyRouteError(
      400,
      "INVALID_BODY",
      "Policy request body must be an object",
    );
  return value as Record<string, unknown>;
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PolicyRouteError(
      400,
      "INVALID_FACTS",
      "Policy facts must be an object",
    );
  return value as Readonly<Record<string, unknown>>;
}
function optionalText(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const result = value[key];
  return typeof result === "string" && result.trim()
    ? result.trim()
    : undefined;
}
function requiredText(value: Record<string, unknown>, key: string): string {
  const result = optionalText(value, key);
  if (!result)
    throw new PolicyRouteError(400, "MISSING_FIELD", `${key} is required`);
  return result;
}
function uuidArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          entry,
        ),
    )
  )
    throw new PolicyRouteError(
      400,
      "INVALID_POLICY_IDS",
      "policyDefinitionIds must contain at most 100 UUIDs",
    );
  return [...new Set(value.map((entry) => String(entry)))];
}

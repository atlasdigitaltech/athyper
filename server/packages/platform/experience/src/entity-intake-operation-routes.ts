import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  parseEntityIntakeOperationResponse,
  type EntityIntakeOperationRequestV1,
  type EntityIntakeOperationResponseV1,
} from "@athyper/contract-platform-entity-runtime";
import { registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, NextFunction, RequestHandler, Response } from "express";
import { entityIntakeOperationContract } from "./entity-runtime-contracts.js";

export class EntityIntakeOperationError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string) {
    super(code);
  }
}
export interface EntityIntakeOperationProvider {
  execute(input: {
    readonly context: VerifiedRequestContext;
    readonly request: EntityIntakeOperationRequestV1;
    readonly idempotencyKey: string;
  }): Promise<EntityIntakeOperationResponseV1>;
}
export interface EntityIntakeOperationProviderRegistry {
  get(input: {
    readonly entityCode: string;
    readonly flowKey: string;
  }): EntityIntakeOperationProvider | undefined;
}

/** The browser selects only a published entity/flow/operation coordinate. Provider
 * resolution and answer-to-command mapping remain exclusively server-owned. */
export function registerEntityIntakeOperationRoutes(
  app: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly providers: EntityIntakeOperationProviderRegistry;
  },
) {
  registerContractRoute(
    app,
    entityIntakeOperationContract,
    options.authenticate,
    async (request, response, next: NextFunction) => {
      try {
        const entityCode = code(request.params.entityCode);
        const flowKey = code(request.params.flowKey);
        const operation = operationCode(request.params.operation);
        const intake = parseRequest(request.body);
        if (intake.flowKey !== flowKey || intake.operation !== operation)
          throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_COORDINATE_MISMATCH");
        const headerVersion = version(request.header("If-Match"));
        if (headerVersion !== undefined && intake.expectedVersion !== undefined && headerVersion !== intake.expectedVersion)
          throw new EntityIntakeOperationError(409, "ENTITY_INTAKE_OPERATION_VERSION_MISMATCH");
        const provider = options.providers.get({ entityCode, flowKey });
        if (!provider)
          throw new EntityIntakeOperationError(503, "ENTITY_INTAKE_OPERATION_PROVIDER_UNAVAILABLE");
        const idempotencyKey = header(request.header("Idempotency-Key"));
        const value = parseEntityIntakeOperationResponse(
          await provider.execute({
            context: options.readContext(response),
            request: headerVersion === undefined ? intake : { ...intake, expectedVersion: headerVersion },
            idempotencyKey,
          }),
        );
        response.setHeader("Cache-Control", "private, no-store").status(200).json(value);
      } catch (error) {
        if (error instanceof EntityIntakeOperationError) {
          response.status(error.status).type("application/problem+json").json(problem(error.status, error.code));
          return;
        }
        next(error);
      }
    },
  );
}

function parseRequest(value: unknown): EntityIntakeOperationRequestV1 {
  if (!record(value) || value.schemaVersion !== 1 || !hash(value.descriptorHash) || !operation(value.operation) || !record(value.answers))
    throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_INPUT_INVALID");
  const flowKey = code(value.flowKey);
  if (value.requestId !== undefined && !uuid(value.requestId))
    throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_INPUT_INVALID");
  if (
    value.expectedVersion !== undefined &&
    (typeof value.expectedVersion !== "number" ||
      !Number.isSafeInteger(value.expectedVersion) ||
      value.expectedVersion < 1)
  )
    throw new EntityIntakeOperationError(409, "ENTITY_INTAKE_OPERATION_VERSION_INVALID");
  return Object.freeze({
    schemaVersion: 1,
    descriptorHash: value.descriptorHash,
    flowKey,
    operation: value.operation,
    answers: Object.freeze({ ...value.answers }),
    ...(value.requestId ? { requestId: value.requestId } : {}),
    ...(value.expectedVersion === undefined ? {} : { expectedVersion: value.expectedVersion }),
  });
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function code(value: unknown): string { if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/.test(value)) throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_INPUT_INVALID"); return value; }
function operation(value: unknown): value is EntityIntakeOperationRequestV1["operation"] { return typeof value === "string" && ["selection", "preview", "save_draft", "submit", "undo", "discard"].includes(value); }
function operationCode(value: unknown): EntityIntakeOperationRequestV1["operation"] { if (!operation(value)) throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_INPUT_INVALID"); return value; }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value); }
function version(value: unknown): number | undefined { if (value === undefined || value === "") return undefined; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new EntityIntakeOperationError(409, "ENTITY_INTAKE_OPERATION_VERSION_INVALID"); return parsed; }
function header(value: unknown): string { if (typeof value !== "string" || value.length < 16 || value.length > 128) throw new EntityIntakeOperationError(400, "ENTITY_INTAKE_OPERATION_IDEMPOTENCY_REQUIRED"); return value; }
function problem(status: number, code: string) { return { type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, code }; }

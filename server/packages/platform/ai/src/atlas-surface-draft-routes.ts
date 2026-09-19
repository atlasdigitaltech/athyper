import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { AtlasServiceError } from "./errors.js";
import { AtlasSurfaceDraftGenerator, type AtlasSurfaceDraftInput } from "./surface-draft-generation.js";

export const generateAtlasSurfaceDraftContract = defineRouteContract({
  method: "post",
  path: "/api/studio/experience-surfaces/atlas-drafts",
  operationId: "generateAtlasExperienceSurfaceDraft",
  summary: "Generate, validate, and persist an Atlas-authored surface draft without publication",
  tags: ["Studio experience", "Atlas"],
  authenticated: true,
  permission: "studio.platform.catalog.manage",
  request: { body: { type: "object", additionalProperties: false, required: ["targetPlane", "layer", "surfaceKey", "instruction"], properties: {
    targetPlane: { enum: ["studio", "neon", "mesh"] }, layer: { enum: ["shared", "tenant"] }, surfaceKey: { type: "string", pattern: "^[a-z][a-z0-9_.-]{1,126}$" }, instruction: { type: "string", minLength: 1, maxLength: 4000 },
    publicModelId: { type: "string", minLength: 1, maxLength: 128 }, dataClass: { enum: ["public", "internal", "confidential", "restricted", "synthetic"] }, agentCode: { type: "string", pattern: "^[a-z][a-z0-9_.-]{1,126}$" }, expectedContentHash: { type: "string", pattern: "^[a-f0-9]{64}$" }, baseDefinition: { type: "object", additionalProperties: true },
  } } },
  responses: {
    200: { description: "Atlas draft persisted through the governed surface validation boundary", body: { type: "object", additionalProperties: true } },
    400: { description: "Generated surface did not pass validation", contentType: "application/problem+json" },
    403: { description: "Studio catalog authority or Atlas admission denied", contentType: "application/problem+json" },
    409: { description: "Draft changed after generation started", contentType: "application/problem+json" },
    503: { description: "Atlas inference is unavailable", contentType: "application/problem+json" },
  },
});

export function registerAtlasSurfaceDraftRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly generator?: AtlasSurfaceDraftGenerator }): void {
  registerContractRoute(application, generateAtlasSurfaceDraftContract, options.authenticate, async (request, response, next) => {
    try {
      if (!options.generator) { problem(response, 503, "ATLAS_SURFACE_GENERATION_UNAVAILABLE", "Atlas surface generation is not enabled for this deployment."); return; }
      response.status(200).setHeader("Cache-Control", "private, no-store").json(await options.generator.generate(options.readContext(response), draftInput(request.body)));
    }
    catch (error) {
      if (error instanceof AtlasServiceError) { problem(response, atlasStatus(error.code), error.code, error.message); return; }
      if (error && typeof error === "object" && typeof Reflect.get(error, "status") === "number" && typeof Reflect.get(error, "code") === "string") { problem(response, Number(Reflect.get(error, "status")), String(Reflect.get(error, "code")), error instanceof Error ? error.message : "Surface draft failed."); return; }
      next(error);
    }
  });
}

function draftInput(value: unknown): AtlasSurfaceDraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AtlasServiceError("INVALID_ARGUMENT", "Atlas surface draft body is required.");
  const body = value as Record<string, unknown>;
  return {
    targetPlane: body.targetPlane as AtlasSurfaceDraftInput["targetPlane"], layer: body.layer as AtlasSurfaceDraftInput["layer"], surfaceKey: typeof body.surfaceKey === "string" ? body.surfaceKey : "", instruction: typeof body.instruction === "string" ? body.instruction : "",
    ...(typeof body.publicModelId === "string" ? { publicModelId: body.publicModelId } : {}), ...(typeof body.dataClass === "string" ? { dataClass: body.dataClass as AtlasSurfaceDraftInput["dataClass"] } : {}), ...(typeof body.agentCode === "string" ? { agentCode: body.agentCode } : {}), ...(typeof body.expectedContentHash === "string" ? { expectedContentHash: body.expectedContentHash } : {}), ...(body.baseDefinition && typeof body.baseDefinition === "object" && !Array.isArray(body.baseDefinition) ? { baseDefinition: body.baseDefinition } : {}),
  };
}

function atlasStatus(code: string): number { return code === "PERMISSION_DENIED" || code === "ADMISSION_DENIED" || code === "BINDING_POLICY_DENIED" ? 403 : code === "PROVIDER_UNAVAILABLE" || code === "CREDENTIAL_UNAVAILABLE" ? 503 : 400; }
function problem(response: Response, status: number, code: string, detail: string): void { response.status(status).type("application/problem+json").json({ type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail, code }); }

import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasLearningInbox } from "./learning-inbox.js";
export function registerAtlasLearningInboxRoutes(app: Application, options: {authenticate: RequestHandler; readContext(response: Response): VerifiedRequestContext; inbox: AtlasLearningInbox; authoring: import("./authoring-service.js").MetaEntityAuthoringService}) {
  const route = (work: (request: any, context: VerifiedRequestContext) => Promise<unknown>): RequestHandler => (request, response, next) => {
    void work(request, options.readContext(response)).then(value => response.json(value)).catch(error => {
      const code = error?.code;
      if (code === "FORBIDDEN") response.status(403).json({error: code});
      else if (error instanceof TypeError) response.status(400).json({error: "INVALID_ARGUMENT", message: error.message});
      else if (typeof code === "string") response.status(409).json({error: code, message: error.message});
      else next(error);
    });
  };
  for (const action of ["submit", "approve", "publish"] as const) app.post(`/api/studio/atlas-learning/:id/${action}`, options.authenticate, route((request, context) => options.inbox.advance(context, uuid(request.params.id), action, revision(request.body?.expectedRevision), options.authoring)));
  app.post("/api/studio/atlas-learning/:id/resume", options.authenticate, route((request, context) => options.inbox.resume(context, uuid(request.params.id), options.authoring)));
  app.get("/api/studio/atlas-learning", options.authenticate, route((_request, context) => options.inbox.list(context)));
  app.post("/api/studio/atlas-learning/:id/reject", options.authenticate, route((request, context) => options.inbox.reject(context, uuid(request.params.id), revision(request.body?.revision))));
  app.post("/api/studio/atlas-learning/:id/stage", options.authenticate, route(async (request, context) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["revision", "fixtures", "fixtureSetId", "requalify"].includes(key)) ||
        (body.requalify !== undefined && typeof body.requalify !== "boolean") ||
        (body.fixtureSetId !== undefined && (typeof body.fixtureSetId !== "string" || !body.fixtureSetId.trim() || body.fixtureSetId.length > 200 || body.fixtures !== undefined)))
      throw new TypeError("Provide fixtures or one controlled fixture set ID with the current revision");
    return options.inbox.stage(context, { id: uuid(request.params.id), revision: revision(body.revision), requalify: body.requalify,
      ...(body.fixtureSetId === undefined ? { fixtures: body.fixtures } : { fixtureSetId: body.fixtureSetId }) });
  }));
}
function uuid(value: unknown): string { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new TypeError("Invalid review coordinate"); return value; }
function revision(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError("Current revision is required"); return Number(value); }

import { AuthoringConflictError, AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { Application, RequestHandler, Response } from "express";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "./authoring-service.js";
import { parseEntityRegistration } from "./entity-registration.js";
export interface MetaEntityAuthoringRouteOptions {
  authenticate: RequestHandler;
  readContext(response: Response): VerifiedRequestContext;
  authorizer: Authorizer;
  /** Read-only policy gate; never used by mutation routes. */
  inspectionAuthorizer?: Authorizer;
  service: MetaEntityAuthoringService;
  addressPreviewChoices?: (context: VerifiedRequestContext) => Promise<unknown>;
  inspectActivation?: (context: VerifiedRequestContext, release: import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease) => Promise<unknown>;
}
export function registerMetaEntityAuthoringRoutes(
  app: Application,
  o: MetaEntityAuthoringRouteOptions,
) {
  app.get("/api/meta-entity-authoring/change-sets/:id/history", o.authenticate, handler(async (q,s) => {
    const c = await allowed(o,s,["metadata.entity.author","metadata.entity.review"]); if(!c)return;
    const id=uuid(q.params.id); await scoped(o,c,id); s.setHeader("Cache-Control","private, no-store");
    s.json(await o.service.listDraftSaves(id));
  }));
  app.get("/api/meta-entity-authoring/change-sets/:id/history/:revision", o.authenticate, handler(async (q,s) => {
    const c = await allowed(o,s,["metadata.entity.author","metadata.entity.review"]); if(!c)return;
    const id=uuid(q.params.id); await scoped(o,c,id);
    const revision=Number(q.params.revision); if(!Number.isSafeInteger(revision)||revision<0){s.status(400).json({error:"INVALID_REVISION"});return;}
    s.setHeader("Cache-Control","private, no-store");
    const graph=await o.service.readDraftSave(id,revision);
    if(!graph){s.status(404).json({error:"SAVED_REVISION_NOT_AVAILABLE"});return;}
    s.json({revision,graph});
  }));
  app.get("/api/meta-entity-authoring/inspection/address-preview-choices", o.authenticate, handler(async (_q, s) => {
    const c = await allowed(o, s, ["metadata.entity.author", "metadata.entity.review"]);
    if (!c) return;
    s.setHeader("Cache-Control", "private, no-store");
    if (!o.addressPreviewChoices) { s.status(503).json({error:"ADDRESS_PREVIEW_CHOICES_UNAVAILABLE"}); return; }
    s.json(await o.addressPreviewChoices(c));
  }));
  app.get("/api/meta-entity-authoring/inspection/releases/:id/activation", o.authenticate, handler(async (q,s)=>{
    const c=await allowed(o,s,"publication.deployment.view",{releaseId:uuid(q.params.id)});
    if(!c)return;
    s.setHeader("Cache-Control","private, no-store");
    const source=await o.service.readInspectionRelease(c.tenantId,uuid(q.params.id));
    if(!source){s.status(404).json({error:"RELEASE_NOT_FOUND"});return;}
    if(!o.inspectActivation){s.status(503).json({error:"ACTIVATION_INSPECTION_UNAVAILABLE"});return;}
    s.json(await o.inspectActivation(c,source.release));
  }));
  app.get("/api/meta-entity-authoring/inspection/releases", o.authenticate, handler(async (_q, s) => {
    const c = await allowed(o, s, ["metadata.entity.author", "metadata.entity.review"]);
    if (c) { s.setHeader("Cache-Control", "private, no-store"); s.json(await o.service.listInspectionReleases(c.tenantId)); }
  }));
  app.get("/api/meta-entity-authoring/inspection/releases/:id", o.authenticate, handler(async (q, s) => {
    const c = await allowed(o, s, ["metadata.entity.author", "metadata.entity.review"]);
    if (!c) return;
    s.setHeader("Cache-Control", "private, no-store");
    const result = await o.service.readInspectionRelease(c.tenantId, uuid(q.params.id));
    if (!result) { s.status(404).json({error:"RELEASE_NOT_FOUND"}); return; }
    s.json(result);
  }));
  app.get(
    "/api/meta-entity-authoring/change-sets",
    o.authenticate,
    handler(async (_q, s) => {
      const c = await allowed(o, s, ["metadata.entity.author", "metadata.entity.review"]);
      if (c) { s.setHeader("Cache-Control", "private, no-store"); s.json(await o.service.list(c.tenantId)); }
    }),
  );
  app.get(
    "/api/meta-entity-authoring/change-sets/:id/graph",
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, ["metadata.entity.author", "metadata.entity.review"]);
      if (c) {
        s.setHeader("Cache-Control", "private, no-store");
        await scoped(o, c, uuid(q.params.id));
        s.json(await o.service.readGraph(uuid(q.params.id)));
      }
    }),
  );
  action(
    app,
    o,
    "fork",
    "metadata.entity.author",
    (id, c) => o.service.forkDraft(id, c.principalId),
    201,
  );
  app.post(
    "/api/meta-entity-authoring/change-sets",
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, "metadata.entity.author");
      if (c) {
        const registration = parseEntityRegistration(q.body?.registration);
        s.status(201).json(
          await o.service.createDraft({
            tenantId: c.tenantId,
            entityId: uuid(str(q.body, "entityId")),
            entityCode: str(q.body, "entityCode"),
            branchCode: str(q.body, "branchCode"),
            title: str(q.body, "title"),
            actorId: c.principalId,
            ...(registration ? { registration } : {}),
          }),
        );
      }
    }),
  );
  app.put(
    "/api/meta-entity-authoring/change-sets/:id/graph",
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, "metadata.entity.author");
      if (c) {
        await scoped(o, c, uuid(q.params.id));
        s.json(
          await o.service.replaceGraph({
            changeSetId: uuid(q.params.id),
            expectedRevision: rev(q),
            graph: contract(q.body),
            actorId: c.principalId,
            context: c,
          }),
        );
      }
    }),
  );
  action(app, o, "validate", "metadata.entity.validate", (id, c) =>
    o.service.validate(id, c.principalId),
  );
  action(app, o, "test", "metadata.entity.test", (id, c) =>
    o.service.test(id, c.principalId),
  );
  action(app, o, "submit", "metadata.entity.submit", (id, c, q) =>
    o.service.submit({
      changeSetId: id,
      expectedRevision: rev(q),
      actorId: c.principalId,
    }),
  );
  action(app, o, "approve", "metadata.entity.review", (id, c, q) =>
    o.service.approve({
      changeSetId: id,
      expectedRevision: rev(q),
      actorId: c.principalId,
      ...breakGlass(q.body),
    }),
  );
  action(
    app,
    o,
    "publish",
    "metadata.entity.publish",
    (id, c, q) =>
      q.body?.releaseId
        ? o.service.redispatch({
            releaseId: uuid(q.body.releaseId),
            targetPlanes: planeList(q.body),
          })
        : o.service.publish({
            changeSetId: id,
            expectedRevision: rev(q),
            actorId: c.principalId,
            targetPlanes: planeList(q.body),
          }),
    202,
  );
  app.post(
    "/api/meta-entity-authoring/releases/:id/activate",
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, "metadata.entity.activate", {
        releaseId: uuid(q.params.id),
      });
      if (c)
        s.json(
          await o.service.activate({
            releaseId: uuid(q.params.id),
            plane: onePlane(q.body),
            actorId: c.principalId,
          }),
        );
    }),
  );
  app.post(
    "/api/meta-entity-authoring/releases/:id/rollback",
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, "metadata.entity.rollback");
      if (c) {
        await scoped(o, c, uuid(str(q.body, "changeSetId")));
        s.status(202).json(
          await o.service.rollback({
            priorReleaseId: uuid(q.params.id),
            changeSetId: uuid(str(q.body, "changeSetId")),
            expectedRevision: rev(q),
            actorId: c.principalId,
            targetPlanes: planeList(q.body),
          }),
        );
      }
    }),
  );
}
function action(
  app: Application,
  o: MetaEntityAuthoringRouteOptions,
  name: string,
  permission: string,
  work: (id: string, c: VerifiedRequestContext, q: any) => Promise<unknown>,
  status = 200,
) {
  app.post(
    `/api/meta-entity-authoring/change-sets/:id/${name}`,
    o.authenticate,
    handler(async (q, s) => {
      const c = await allowed(o, s, permission, {
        changeSetId: uuid(q.params.id),
        ...(name === "publish" && q.body?.releaseId
          ? { releaseId: uuid(q.body.releaseId) }
          : {}),
      });
      if (c) {
        await scoped(o, c, uuid(q.params.id));
        s.status(status).json(await work(uuid(q.params.id), c, q));
      }
    }),
  );
}
async function allowed(
  o: MetaEntityAuthoringRouteOptions,
  s: Response,
  p: string | readonly string[],
  resource?: Readonly<Record<string, unknown>>,
) {
  const c = o.readContext(s);
  if (c.planeKey !== "studio") {
    s.status(403).json({ error: "FORBIDDEN", reason: "plane_excluded" });
    return;
  }
  // Alternative read authority still passes through the full authorizer,
  // including grant validity, tenant scope, deny rules and MFA.
  let reason: string | undefined;
  for (const permissionCode of typeof p === "string" ? [p] : p) {
    const decision = await (Array.isArray(p) ? o.inspectionAuthorizer ?? o.authorizer : o.authorizer).authorize({
      context: c,
      permissionCode,
      resource: { ...resource, tenantId: c.tenantId },
    });
    if (decision.allowed) return c;
    if (!reason || decision.reason === "mfa_required") reason = decision.reason;
  }
  s.status(403).json({ error: "FORBIDDEN", reason });
  return;
}
function handler(fn: (q: any, s: any) => Promise<void>): RequestHandler {
  return (q, s, n) => {
    void fn(q, s).catch((error) => {
      if (error instanceof AuthoringPolicyError && error.code === "RESTORATION_PUBLICATION_ALREADY_EXISTS") {
        s.status(409).json({ error: error.code, detail: error.message });
        return;
      }
      if (error instanceof AuthoringConflictError) {
        s.status(409).json({ error: error.code, detail: error.message });
        return;
      }
      n(error);
    });
  };
}
function str(v: unknown, k: string) {
  const x = v && typeof v === "object" ? Reflect.get(v, k) : undefined;
  if (typeof x !== "string" || !x.trim())
    throw new TypeError(`${k} is required`);
  return x.trim();
}
function uuid(v: unknown) {
  const x = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x))
    throw new TypeError("Invalid UUID");
  return x;
}
function rev(q: any) {
  const x = Number(q.headers["if-match"] ?? q.body?.expectedRevision);
  if (!Number.isSafeInteger(x) || x < 0)
    throw new TypeError("If-Match revision is required");
  return x;
}
function contract(v: unknown) {
  if (
    !v ||
    typeof v !== "object" ||
    Reflect.get(v, "contractSchema") !== "athyper.meta-entity-contract/2.1"
  )
    throw new TypeError("Contract 2.1 graph is required");
  return v as MetaEntityGraph;
}
function onePlane(v: unknown) {
  const p = str(v, "plane");
  if (p !== "studio" && p !== "neon" && p !== "mesh")
    throw new TypeError("Invalid plane");
  return p;
}
function planeList(v: unknown) {
  const p =
    v && typeof v === "object" ? Reflect.get(v, "targetPlanes") : undefined;
  if (!Array.isArray(p) || !p.length)
    throw new TypeError("targetPlanes are required");
  return p.map((x) => onePlane({ plane: x }));
}
function breakGlass(v: unknown) {
  const b =
    v && typeof v === "object" ? Reflect.get(v, "breakGlass") : undefined;
  if (b)
    throw new TypeError(
      "Break-glass review requires server-verified approval evidence",
    );
  return {};
}

async function scoped(
  o: MetaEntityAuthoringRouteOptions,
  c: VerifiedRequestContext,
  id: string,
) {
  const platform = (
    await o.authorizer.authorize({
      context: c,
      permissionCode: "studio.platform.catalog.manage",
    })
  ).allowed;
  await o.service.assertTenant(id, c.tenantId, platform);
}

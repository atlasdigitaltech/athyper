import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  CollaborationService,
  CommentFormat,
  CommentVisibility,
} from "@athyper/server-contract-collaboration";
import type { Application, RequestHandler, Response } from "express";
import { CollaborationError } from "./errors.js";
export function registerCollaborationRoutes(
  app: Application,
  o: {
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    collaboration: CollaborationService;
  },
) {
  const route =
    (
      work: (
        r: any,
        c: VerifiedRequestContext,
      ) => Promise<{ status?: number; body?: unknown }>,
    ) =>
    async (r: any, s: Response, n: any) => {
      try {
        const out = await work(r, o.readContext(s));
        if (out.status === 204) {
          s.status(204).end();
          return;
        }
        s.status(out.status ?? 200).json(out.body);
      } catch (e) {
        if (e instanceof CollaborationError)
          s.status(e.statusCode)
            .type("application/problem+json")
            .json({
              type: `https://athyper.dev/problems/${e.code.toLowerCase()}`,
              title: e.code,
              status: e.statusCode,
              detail: e.message,
              code: e.code,
            });
        else n(e);
      }
    };
  const create = route(async (r, c) => {
    const b = body(r);
    return { status: 201, body: await o.collaboration.create(command(c, b)) };
  });
  app.post("/api/collab/comments", o.authenticate, create);
  app.post(
    "/api/collab/comments/:id/replies",
    o.authenticate,
    route(async (r, c) => {
      const b = body(r);
      return {
        status: 201,
        body: await o.collaboration.create({
          ...command(c, b),
          parentCommentId: uuid(r.params.id),
        }),
      };
    }),
  );
  app.patch(
    "/api/collab/comments/:id",
    o.authenticate,
    route(async (r, c) => {
      const b = body(r);
      return {
        body: await o.collaboration.edit({
          context: c,
          commentId: uuid(r.params.id),
          text: req(b, "text"),
          ...rich(b),
          mentionedPrincipalIds: uuids(b.mentionedPrincipalIds),
          attachmentIds: uuids(b.attachmentIds),
          expectedUpdatedAt: opt(b, "expectedUpdatedAt"),
        }),
      };
    }),
  );
  app.delete(
    "/api/collab/comments/:id",
    o.authenticate,
    route(async (r, c) => {
      if (
        !(await o.collaboration.remove({
          context: c,
          commentId: uuid(r.params.id),
        }))
      )
        throw new CollaborationError(
          404,
          "COMMENT_NOT_FOUND",
          "Comment was not found",
        );
      return { status: 204 };
    }),
  );
  app.post(
    "/api/collab/comments/:id/reactions",
    o.authenticate,
    route(async (r, c) => ({
      status: 201,
      body: {
        inserted: await o.collaboration.putReaction({
          context: c,
          commentId: uuid(r.params.id),
          code: req(body(r), "code"),
        }),
      },
    })),
  );
  app.delete(
    "/api/collab/comments/:id/reactions/:code",
    o.authenticate,
    route(async (r, c) => ({
      body: {
        deleted: await o.collaboration.deleteReaction({
          context: c,
          commentId: uuid(r.params.id),
          code: String(r.params.code),
        }),
      },
    })),
  );
  app.post(
    "/api/collab/drafts",
    o.authenticate,
    route(async (r, c) => {
      await o.collaboration.putDraft(command(c, body(r)));
      return { status: 204 };
    }),
  );
  app.delete(
    "/api/collab/drafts",
    o.authenticate,
    route(async (r, c) => {
      const q = r.query;
      return {
        body: {
          deleted: await o.collaboration.deleteDraft({
            context: c,
            ...coordinate(q),
            parentCommentId: uuidOpt(q.parentCommentId),
          }),
        },
      };
    }),
  );
  app.post(
    "/api/collab/comments/mark-all-read",
    o.authenticate,
    route(async (r, c) => {
      const b = body(r);
      await o.collaboration.markRead({
        context: c,
        ...coordinate(b),
        readAt: opt(b, "readAt"),
      });
      return { status: 204 };
    }),
  );
  app.post(
    "/api/collab/comments/:id/flag",
    o.authenticate,
    route(async (r, c) => {
      const b = body(r);
      return {
        status: 201,
        body: {
          id: await o.collaboration.flag({
            context: c,
            commentId: uuid(r.params.id),
            reasonCode: req(b, "reasonCode"),
            detail: opt(b, "detail"),
          }),
        },
      };
    }),
  );
}
function command(c: VerifiedRequestContext, b: Record<string, unknown>) {
  return {
    context: c,
    ...coordinate(b),
    text: req(b, "text"),
    ...rich(b),
    parentCommentId: uuidOpt(b.parentCommentId),
    visibility: one(b.visibility, [
      "public",
      "internal",
      "private",
    ] as const) as CommentVisibility | undefined,
    intent: opt(b, "intent"),
    mentionedPrincipalIds: uuids(b.mentionedPrincipalIds),
    attachmentIds: uuids(b.attachmentIds),
    idempotencyKey: opt(b, "idempotencyKey"),
  };
}
function rich(b: Record<string, unknown>) {
  const format = one(b.format, ["plain", "rich_json"] as const) as
    CommentFormat | undefined;
  if (
    b.content !== undefined &&
    (!b.content || typeof b.content !== "object" || Array.isArray(b.content))
  )
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      "content must be an object",
    );
  return {
    format,
    ...(b.content && typeof b.content === "object" && !Array.isArray(b.content)
      ? { content: b.content as Record<string, unknown> }
      : {}),
  };
}
function coordinate(v: Record<string, unknown>) {
  return {
    contextType: opt(v, "contextType"),
    entityType: req(v, "entityType"),
    entityId: req(v, "entityId"),
  };
}
function body(r: any): Record<string, unknown> {
  if (!r.body || typeof r.body !== "object" || Array.isArray(r.body))
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      "JSON object required",
    );
  return r.body;
}
function req(v: Record<string, unknown>, k: string) {
  const x = opt(v, k);
  if (!x)
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      `${k} is required`,
    );
  return x;
}
function opt(v: Record<string, unknown>, k: string) {
  const x = v[k];
  if (x === undefined) return undefined;
  if (typeof x !== "string" || !x.trim())
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      `${k} must be a nonempty string`,
    );
  return x.trim();
}
function uuid(v: unknown) {
  const x = String(v ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      x,
    )
  )
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      "UUID required",
    );
  return x;
}
function uuidOpt(v: unknown) {
  return v === undefined ? undefined : uuid(v);
}
function uuids(v: unknown) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v))
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      "UUID array required",
    );
  return v.map(uuid);
}
function one<T extends string>(v: unknown, values: readonly T[]) {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !values.includes(v as T))
    throw new CollaborationError(
      400,
      "INVALID_COLLABORATION_REQUEST",
      `Expected one of: ${values.join(", ")}`,
    );
  return v as T;
}

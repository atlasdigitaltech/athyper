import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocumentEditSubmitRequestV1Schema,
  DocumentEditSubmitResponseV1Schema,
} from "@athyper/api-contracts/document-edit-submit";
import {
  DocumentEditDiscardDraftRequestV1Schema,
  DocumentEditRevertToBaselineRequestV1Schema,
} from "@athyper/api-contracts/document-edit-discard";

const mocks = vi.hoisted(() => ({
  deleteDraft: vi.fn(),
  loadContext: vi.fn(),
  publishEvent: vi.fn(),
  readDraft: vi.fn(),
  upsertDraft: vi.fn(),
  validateWorkspace: vi.fn(),
}));

vi.mock("@/lib/server/document-edit-runtime-route-context", () => ({
  documentEditLifecycleHeaders: (lifecycle: string, serverMs: number) => ({
    "Cache-Control": "no-store",
    "X-Document-Edit-Lifecycle": lifecycle,
    "X-Document-Edit-Server-Ms": String(serverMs),
  }),
  elapsedLifecycleMs: () => 1,
  loadDocumentEditRuntimeRouteContext: mocks.loadContext,
  readDocumentEditRuntimeJson: (request: Request) => request.json().catch(() => null),
  readLifecycleRecord: (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
}));
vi.mock("@/lib/server/document-edit-runtime-drafts", () => ({
  DocumentEditDraftConflictError: class DocumentEditDraftConflictError extends Error {},
  deleteDocumentEditServerDraft: mocks.deleteDraft,
  documentEditDraftSummary: (draft: unknown) => draft ?? {},
  readDocumentEditServerDraft: mocks.readDraft,
  upsertDocumentEditServerDraft: mocks.upsertDraft,
}));
vi.mock("@/lib/server/document-edit-runtime-events", () => ({
  buildDocumentEditRuntimeEventScope: () => ({}),
  publishDocumentEditRuntimeEvent: mocks.publishEvent,
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: () => ({ Authorization: "Bearer runtime-token" }),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));
vi.mock("@/lib/server/document-edit-workspace-validation", () => ({
  validateDocumentEditWorkspace: mocks.validateWorkspace,
}));

import { POST } from "../entities/[entity]/[id]/edit/submit/route";

const CONTEXT = {
  session: {},
  entityCode: "purchase_order",
  recordId: "po-1",
  record: { id: "po-1", data: {} },
  descriptor: {},
  editRuntime: {
    workflowPolicy: { submitAction: "submit" },
    submitPolicy: { saveAndTransitionEnabled: true },
  },
};

const VALID_REQUEST = {
  intent: "save" as const,
  changes: { header: { party_id: "party-1" } },
  sourceTabId: "tab-1",
  clientSeq: 7,
};

const SUCCESS = {
  ok: true,
  intent: "save",
  record: { id: "po-1", data: { row_version: 2 }, status: "draft" },
  etag: "2",
  fieldMask: {},
  sectionMask: {},
  invalidations: [{ type: "core", key: "record" }],
  documentVersion: 12,
};

function params() {
  return { params: Promise.resolve({ entity: "purchase_order", id: "po-1" }) };
}

function request(body: unknown = VALID_REQUEST, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/runtime/v1/entities/purchase_order/po-1/edit/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Document-Edit-Workspace": "workspace-token",
      "If-Match": "1",
      "Idempotency-Key": "stable-submit-key",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("document edit submit v1 schemas", () => {
  it("accepts the versioned save shape", () => {
    expect(DocumentEditSubmitRequestV1Schema.parse(VALID_REQUEST)).toEqual(VALID_REQUEST);
    expect(DocumentEditSubmitResponseV1Schema.parse(SUCCESS)).toEqual(SUCCESS);
  });

  it("requires an action for save_and_transition", () => {
    const parsed = DocumentEditSubmitRequestV1Schema.safeParse({
      ...VALID_REQUEST,
      intent: "save_and_transition",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["action"]);
  });

  it("rejects an empty save and unknown request properties", () => {
    expect(DocumentEditSubmitRequestV1Schema.safeParse({
      ...VALID_REQUEST,
      changes: {},
    }).success).toBe(false);
    expect(DocumentEditSubmitRequestV1Schema.safeParse({
      ...VALID_REQUEST,
      legacyActionCode: "submit",
    }).success).toBe(false);
    expect(DocumentEditSubmitRequestV1Schema.safeParse({
      ...VALID_REQUEST,
      action: { code: "submit" },
    }).success).toBe(false);
  });
});

describe("document edit discard operation schemas", () => {
  it("does not allow baseline reversal through discard_draft", () => {
    expect(DocumentEditDiscardDraftRequestV1Schema.safeParse({
      operation: "discard_draft",
      sourceTabId: "tab-1",
    }).success).toBe(true);
    expect(DocumentEditDiscardDraftRequestV1Schema.safeParse({
      operation: "revert_to_baseline",
      sourceTabId: "tab-1",
    }).success).toBe(false);
    expect(DocumentEditRevertToBaselineRequestV1Schema.safeParse({
      operation: "revert_to_baseline",
      sourceTabId: "tab-1",
    }).success).toBe(true);
  });
});

describe("POST document edit submit v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadContext.mockResolvedValue({ ok: true, context: CONTEXT });
    mocks.validateWorkspace.mockReturnValue({ ok: true, claims: {} });
    mocks.readDraft.mockResolvedValue(null);
    mocks.upsertDraft.mockResolvedValue({ id: "draft-1" });
    mocks.deleteDraft.mockResolvedValue(undefined);
  });

  it("requires If-Match and Idempotency-Key", async () => {
    const missingEtag = await POST(request(VALID_REQUEST, { "If-Match": "" }), params());
    expect(missingEtag.status).toBe(428);
    expect((await missingEtag.json()).error).toBe("PRECONDITION_REQUIRED");

    const missingKey = await POST(request(VALID_REQUEST, { "Idempotency-Key": "" }), params());
    expect(missingKey.status).toBe(428);
    expect((await missingKey.json()).error).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("can disable save_and_transition while preserving ordinary workspace save", async () => {
    mocks.loadContext.mockResolvedValueOnce({
      ok: true,
      context: {
        ...CONTEXT,
        descriptor: {
          relations: [{ name: "lines", key: "lines", targetEntity: "purchase_order_line", mutationOwner: "workspace" }],
        },
        editRuntime: {
          ...CONTEXT.editRuntime,
          submitPolicy: { saveAndTransitionEnabled: false },
        },
      },
    });
    const response = await POST(request({
      ...VALID_REQUEST,
      intent: "save_and_transition",
      action: { code: "submit" },
    }), params());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("SAVE_AND_TRANSITION_DISABLED");
  });

  it("enforces each submitted collection from descriptor metadata", async () => {
    mocks.loadContext.mockResolvedValueOnce({
      ok: true,
      context: {
        ...CONTEXT,
        descriptor: {
          relations: [
            { name: "items", key: "items", targetEntity: "purchase_order_line", mutationOwner: "workspace" },
            { name: "charges", key: "charges", targetEntity: "purchase_order_charge", mutationOwner: "workspace" },
          ],
        },
        editRuntime: {
          ...CONTEXT.editRuntime,
          childCollections: [
            { key: "items", sectionKey: "items", entityCode: "purchase_order_line", relationName: "items", mutationPolicy: { create: true, update: true, delete: true } },
            { key: "charges", sectionKey: "charges", entityCode: "purchase_order_charge", relationName: "charges", mutationPolicy: { create: false, update: true, delete: false } },
          ],
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({
      ...VALID_REQUEST,
      changes: { collections: { items: { create: [{ sku: "a" }] }, charges: { create: [{ code: "freight" }] } } },
    }), params());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "CHILD_MUTATION_DENIED", collection: "charges" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects direct-CRUD relations presented as workspace changes", async () => {
    mocks.loadContext.mockResolvedValueOnce({
      ok: true,
      context: {
        ...CONTEXT,
        descriptor: { relations: [{ name: "contacts", key: "contacts", targetEntity: "contact", mutationOwner: "direct_crud" }] },
        editRuntime: {
          ...CONTEXT.editRuntime,
          childCollections: [{ key: "contacts", sectionKey: "contacts", entityCode: "contact", relationName: "contacts", mutationPolicy: { create: true, update: true, delete: true } }],
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST(request({
      ...VALID_REQUEST,
      changes: { collections: { contacts: { create: [{ name: "x" }] } } },
    }), params());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "CHILD_COLLECTION_WORKSPACE_OWNERSHIP_REQUIRED" });
  });

  it("returns the specific workspace failure before reading the submit body", async () => {
    const workspaceResponse = new Response(JSON.stringify({
      error: "STALE_WORKSPACE",
      message: "Reload the workspace.",
    }), { status: 409, headers: { "Content-Type": "application/json" } });
    mocks.validateWorkspace.mockReturnValueOnce({ ok: false, response: workspaceResponse });
    const response = await POST(request(), params());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "STALE_WORKSPACE",
      message: "Reload the workspace.",
    });
  });

  it("returns 422 with field paths for an invalid request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({ ...VALID_REQUEST, clientSeq: -1 }), params());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "VALIDATION",
      fieldErrors: { clientSeq: expect.any(Array) },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects line mutations that are not declared by the workspace", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({
      ...VALID_REQUEST,
      changes: { lines: { delete: ["line-1"] } },
    }), params());

    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("CHILD_COLLECTION_NOT_DECLARED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["create", "update", "delete"] as const)(
    "rejects undeclared %s child mutations without dispatching upstream",
    async (mutation) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = await POST(request({
        ...VALID_REQUEST,
        changes: {
          collections: {
            lines: mutation === "delete"
              ? { delete: ["line-1"] }
              : mutation === "update"
                ? { update: [{ id: "line-1", qty: 2 }] }
                : { create: [{ id: "line-1", qty: 2 }] },
          },
        },
      }), params());

      expect(response.status).toBe(422);
      expect((await response.json()).error).toBe("CHILD_COLLECTION_NOT_DECLARED");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("enforces the declared child mutation policy independently", async () => {
    mocks.loadContext.mockResolvedValueOnce({
      ok: true,
      context: {
        ...CONTEXT,
        descriptor: {
          relations: [{ name: "lines", key: "lines", targetEntity: "purchase_order_line", mutationOwner: "workspace" }],
        },
        editRuntime: {
          ...CONTEXT.editRuntime,
          childCollections: [{
            key: "lines",
            sectionKey: "items",
            entityCode: "purchase_order_line",
            relationName: "lines",
            mutationPolicy: { create: true, update: true, delete: false },
          }],
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request({
      ...VALID_REQUEST,
      changes: { lines: { delete: ["line-1"] } },
    }), params());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "CHILD_MUTATION_DENIED",
      operations: ["delete"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards all concurrency headers and returns only the v1 success contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...SUCCESS,
      internalTelemetry: { serverMs: 4 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Document-Edit-Cache": "idempotency" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe("2");
    expect(response.headers.get("X-Document-Edit-Cache")).toBe("idempotency");
    expect(await response.json()).toEqual(SUCCESS);
    expect(mocks.deleteDraft).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_order/po-1/edit/submit");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Document-Edit-Workspace": "workspace-token",
      "If-Match": "1",
      "Idempotency-Key": "stable-submit-key",
    });
  });

  it.each([
    [409, 412, { error: "VERSION_CONFLICT", currentEtag: "8" }],
    [400, 422, { error: "VALIDATION", fieldErrors: { party_id: "required" } }],
    [423, 423, { error: "LOCK_REQUIRED", message: "locked" }],
    [403, 403, { error: "POLICY_DENIED", message: "denied" }],
    [409, 409, { error: "IDEMPOTENCY_KEY_REUSED", message: "different request" }],
    [409, 409, { error: "IDEMPOTENCY_IN_PROGRESS", message: "retry later" }],
  ])("normalizes upstream %i failures to contract status %i", async (upstreamStatus, contractStatus, failure) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(failure), {
      status: upstreamStatus,
      headers: { "Content-Type": "application/json" },
    })));
    const response = await POST(request(), params());
    expect(response.status).toBe(contractStatus);
    expect(await response.json()).toEqual(failure);
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });

  it("rejects a successful upstream payload that violates the v1 response contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const response = await POST(request(), params());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("INVALID_SUBMIT_RESPONSE");
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });
});

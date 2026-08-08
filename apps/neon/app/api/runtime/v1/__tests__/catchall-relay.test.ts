// BFF relay tests — /api/runtime/v1/[...path]
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  relayHandler: vi.fn(async (_request: Request) => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  relationHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  fieldOptionsHandler: vi.fn(async () => new Response(JSON.stringify({ options: [] }), { status: 200 })),
  draftInitiateHandler: vi.fn(async () => new Response(JSON.stringify({ record: { id: "draft-1" } }), { status: 201 })),
  draftPromoteHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  draftDiscardHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editSectionsHandler: vi.fn(async () => new Response(JSON.stringify({ sections: [] }), { status: 200 })),
  editCoreHandler: vi.fn(async () => new Response(JSON.stringify({ record: {} }), { status: 200 })),
  editEventsHandler: vi.fn(async () => new Response("event: connected\n\n", { status: 200 })),
  editOpenHandler: vi.fn(async () => new Response(JSON.stringify({ workspace: { id: "workspace-token" } }), { status: 200 })),
  editHydrateHandler: vi.fn(async () => new Response(JSON.stringify({ sections: [] }), { status: 200 })),
  editPreflightHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editResolveChangeHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editDiscardHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editAddressHandler: vi.fn(async () => new Response(JSON.stringify({ options: [] }), { status: 200 })),
  editFieldOptionsHandler: vi.fn(async () => new Response(JSON.stringify({ options: [] }), { status: 200 })),
  editSectionDiscardHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editRowDiscardHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  editSubmitHandler: vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 200 })),
  revertToBaselineHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  buildRelayHandler: vi.fn((options: unknown) => {
    mocks.options = options;
    return mocks.relayHandler;
  }),
  options: undefined as unknown,
  descriptor: vi.fn(),
}));

vi.mock("@athyper/platform-bff-relay", () => ({
  buildRelayHandler: mocks.buildRelayHandler,
}));

vi.mock("server-only", () => ({}));

vi.mock("../entities/[entity]/relations/[relation]/records/[parent_id]/route", () => ({
  GET: mocks.relationHandler,
}));

vi.mock("../entities/[entity]/fields/[field]/options/route", () => ({
  GET: mocks.fieldOptionsHandler,
}));

vi.mock("../entities/[entity]/draft/initiate/route", () => ({
  POST: mocks.draftInitiateHandler,
}));

vi.mock("../entities/[entity]/[id]/draft/promote/route", () => ({
  POST: mocks.draftPromoteHandler,
}));

vi.mock("../entities/[entity]/[id]/draft/discard/route", () => ({
  POST: mocks.draftDiscardHandler,
}));

vi.mock("../entities/[entity]/[id]/edit/sections/route", () => ({
  POST: mocks.editSectionsHandler,
}));

vi.mock("../entities/[entity]/[id]/edit/core/route", () => ({ GET: mocks.editCoreHandler }));

vi.mock("../entities/[entity]/[id]/edit/events/route", () => ({
  GET: mocks.editEventsHandler,
}));

vi.mock("../entities/[entity]/[id]/edit/open/route", () => ({ POST: mocks.editOpenHandler }));
vi.mock("../entities/[entity]/[id]/edit/hydrate/route", () => ({ POST: mocks.editHydrateHandler }));
vi.mock("../entities/[entity]/[id]/edit/preflight/route", () => ({ POST: mocks.editPreflightHandler }));
vi.mock("../entities/[entity]/[id]/edit/resolve-change/route", () => ({ POST: mocks.editResolveChangeHandler }));
vi.mock("../entities/[entity]/[id]/edit/discard/route", () => ({
  POST: mocks.editDiscardHandler,
  DELETE: mocks.editDiscardHandler,
}));
vi.mock("../entities/[entity]/[id]/edit/address/route", () => ({ POST: mocks.editAddressHandler }));
vi.mock("../entities/[entity]/[id]/edit/field-options/batch/route", () => ({ POST: mocks.editFieldOptionsHandler }));
vi.mock("../entities/[entity]/[id]/edit/sections/[section]/discard/route", () => ({ POST: mocks.editSectionDiscardHandler }));
vi.mock("../entities/[entity]/[id]/edit/rows/[collection]/[rowId]/discard/route", () => ({ POST: mocks.editRowDiscardHandler }));

vi.mock("../entities/[entity]/[id]/edit/submit/route", () => ({
  POST: mocks.editSubmitHandler,
}));

vi.mock("../entities/[entity]/[id]/edit/revert-to-baseline/route", () => ({
  POST: mocks.revertToBaselineHandler,
}));

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: mocks.descriptor,
}));

import { DELETE, GET, POST, PUT, PATCH } from "../[...path]/route";

describe("/api/runtime/v1/[...path] relay", () => {
  beforeEach(() => {
    mocks.relayHandler.mockClear();
    mocks.relationHandler.mockClear();
    mocks.fieldOptionsHandler.mockClear();
    mocks.draftInitiateHandler.mockClear();
    mocks.draftPromoteHandler.mockClear();
    mocks.draftDiscardHandler.mockClear();
    mocks.editSectionsHandler.mockClear();
    mocks.editCoreHandler.mockClear();
    mocks.editEventsHandler.mockClear();
    mocks.editOpenHandler.mockClear();
    mocks.editHydrateHandler.mockClear();
    mocks.editPreflightHandler.mockClear();
    mocks.editResolveChangeHandler.mockClear();
    mocks.editDiscardHandler.mockClear();
    mocks.editAddressHandler.mockClear();
    mocks.editFieldOptionsHandler.mockClear();
    mocks.editSectionDiscardHandler.mockClear();
    mocks.editRowDiscardHandler.mockClear();
    mocks.editSubmitHandler.mockClear();
    mocks.revertToBaselineHandler.mockClear();
    mocks.descriptor.mockReset();
    mocks.descriptor.mockResolvedValue(undefined);
  });

  it("configures optimistic concurrency and idempotency headers for the relay", () => {
    expect(mocks.buildRelayHandler).toHaveBeenCalledWith(expect.objectContaining({
      routePrefix: "runtime/v1",
      passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match", "X-Document-Edit-Workspace"],
    }));
  });

  it("rejects catchall PATCH for a document child route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase-order/po-1/lines/line-1", { method: "PATCH" });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase-order", "po-1", "lines", "line-1"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall PUT for a document child route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase_order/po-1/lines/line-1", { method: "PUT" });

    const response = await PUT(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1", "lines", "line-1"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall PUT for a document record route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase_order/po-1", { method: "PUT" });

    const response = await PUT(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall PUT for a ledger record before relay", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "ledger" });
    const request = new Request("http://localhost/api/runtime/v1/entities/journal_entry/entry-1", { method: "PUT" });

    const response = await PUT(request as never, {
      params: Promise.resolve({ path: ["entities", "journal_entry", "entry-1"] }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "LEDGER_READ_ONLY" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall POST for a document child route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase-order/po-1/lines", { method: "POST" });

    const response = await POST(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase-order", "po-1", "lines"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall DELETE for a document child route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase_order/po-1/lines/line-1", { method: "DELETE" });

    const response = await DELETE(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1", "lines", "line-1"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("rejects catchall DELETE for a document record route", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "document" });
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase_order/po-1", { method: "DELETE" });

    const response = await DELETE(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1"] }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
  });

  it("forwards a non-document catchall PATCH mutation to relay", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "simple" });
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/notes",
      { method: "PATCH", body: JSON.stringify({ note: "value" }), headers: { "Content-Type": "application/json" } },
    );
    const response = await PATCH(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1", "notes"] }),
    });

    expect(response.status).toBe(200);
    expect(mocks.relayHandler).toHaveBeenCalledTimes(1);
    const [forwarded] = mocks.relayHandler.mock.calls[0]!;
    expect(forwarded).toBe(request);
  });

  it("forwards a non-document catchall POST mutation to relay", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "simple" });
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/notes",
      { method: "POST", body: JSON.stringify({ note: "value" }), headers: { "Content-Type": "application/json" } },
    );
    const response = await POST(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1", "notes"] }),
    });

    expect(response.status).toBe(200);
    expect(mocks.relayHandler).toHaveBeenCalledTimes(1);
    const [forwarded] = mocks.relayHandler.mock.calls[0]!;
    expect(forwarded).toBe(request);
  });

  it("forwards non-document record-level PUT mutations to relay when no document guard applies", async () => {
    mocks.descriptor.mockResolvedValue({ renderer: "simple" });
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1",
      { method: "PUT", body: JSON.stringify({ note: "value" }), headers: { "Content-Type": "application/json" } },
    );
    const response = await PUT(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_order", "po-1"] }),
    });

    expect(response.status).toBe(200);
    expect(mocks.relayHandler).toHaveBeenCalledTimes(1);
    const [forwarded] = mocks.relayHandler.mock.calls[0]!;
    expect(forwarded).toBe(request);
  });
  it("dispatches draft-initiate POST requests to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/draft/initiate",
      { method: "POST" },
    );

    await POST(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_order", "draft", "initiate"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.draftInitiateHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.draftInitiateHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({ entity: "purchase_order" });
  });

  it("relays generic GET requests to runtime", async () => {
    const request = new Request("http://localhost/api/runtime/v1/entities/purchase_invoice/rec-1/versions");
    await GET(request as never, {
      params: Promise.resolve({ path: ["entities", "purchase_invoice", "rec-1", "versions"] }),
    });

    expect(mocks.relayHandler).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ params: expect.any(Promise) }),
    );
    expect(mocks.relationHandler).not.toHaveBeenCalled();
  });

  it("dispatches document edit section POST requests to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/edit/sections",
      { method: "POST", body: JSON.stringify({ keys: ["components"], context: {} }) },
    );

    await POST(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_order", "po-1", "edit", "sections"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.editSectionsHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.editSectionsHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; id: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({
      entity: "purchase_order",
      id: "po-1",
    });
  });

  it("dispatches document workspace OPEN to Neon instead of relaying it upstream", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/edit/open",
      { method: "POST" },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_order", "po-1", "edit", "open"],
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.editOpenHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.editOpenHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; id: string }> },
    ]>;
    await expect(calls[0]![1].params).resolves.toEqual({ entity: "purchase_order", id: "po-1" });
  });

  it("dispatches document edit event streams to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/edit/events?permission_stamp=stamp",
    );

    await GET(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_order", "po-1", "edit", "events"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.editEventsHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.editEventsHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; id: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({ entity: "purchase_order", id: "po-1" });
  });

  it("dispatches document edit submit requests to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_order/po-1/edit/submit",
      { method: "POST", body: JSON.stringify({ actionCode: "submit" }) },
    );

    await POST(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_order", "po-1", "edit", "submit"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.editSubmitHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.editSubmitHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; id: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({ entity: "purchase_order", id: "po-1" });
  });

  it("dispatches explicit baseline reversal separately from draft discard", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_invoice/inv-1/edit/revert-to-baseline",
      { method: "POST", body: JSON.stringify({ operation: "revert_to_baseline", sourceTabId: "tab-1" }) },
    );
    await POST(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_invoice", "inv-1", "edit", "revert-to-baseline"],
      }),
    });
    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.revertToBaselineHandler).toHaveBeenCalledTimes(1);
  });

  it("dispatches relation-record GET requests to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase_invoice/relations/accounting_distributions/records/inv-1",
    );

    await GET(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase_invoice", "relations", "accounting_distributions", "records", "inv-1"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.relationHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.relationHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; relation: string; parent_id: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({
      entity: "purchase_invoice",
      relation: "accounting_distributions",
      parent_id: "inv-1",
    });
  });

  it("dispatches field-options GET requests to the typed BFF handler", async () => {
    const request = new Request(
      "http://localhost/api/runtime/v1/entities/purchase-invoice/fields/supplier_id/options?value=sup-1",
    );

    await GET(request as never, {
      params: Promise.resolve({
        path: ["entities", "purchase-invoice", "fields", "supplier_id", "options"],
      }),
    });

    expect(mocks.relayHandler).not.toHaveBeenCalled();
    expect(mocks.fieldOptionsHandler).toHaveBeenCalledTimes(1);
    const calls = mocks.fieldOptionsHandler.mock.calls as unknown as Array<[
      Request,
      { params: Promise<{ entity: string; field: string }> },
    ]>;
    const [, context] = calls[0]!;
    await expect(context.params).resolves.toEqual({
      entity: "purchase-invoice",
      field: "supplier_id",
    });
  });
});



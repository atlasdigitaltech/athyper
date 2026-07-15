import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION,
  DocumentEditRuntimeContractSchema,
  type DocumentEditRuntimeContract,
} from "@athyper/runtime-contracts";
import {
  applyDocumentEditReaction,
  buildDocumentEditCoreQueryKey,
  buildDocumentEditEndpoints,
  buildDocumentEditSectionQueryKey,
  clearDocumentEditWorkspaceRecovery,
  dedupeDocumentEditInvalidations,
  discardDocumentEditDraft,
  documentEditWorkspaceRecoveryKey,
  DocumentEditRequestError,
  fetchDocumentEditSection,
  fetchDocumentEditSubmit,
  fetchWorkspaceSection,
  findDocumentEditWorkspaceRecovery,
  isDocumentEditSectionAutoLoad,
  loadDocumentEditSectionForLifecycle,
  isOwnDocumentEditEvent,
  resolveDocumentSubmitAttempt,
  withStaleWorkspaceRetry,
  type DocumentEditCoordinatorIdentity,
} from "../document-runtime/document-edit-coordinator";

describe("document edit cross-tab events", () => {
  it("ignores only events emitted by the current source tab", () => {
    expect(isOwnDocumentEditEvent({ sourceTabId: "tab-a" }, "tab-a")).toBe(true);
    expect(isOwnDocumentEditEvent({ sourceTabId: "tab-b" }, "tab-a")).toBe(false);
    expect(isOwnDocumentEditEvent({}, "tab-a")).toBe(false);
  });
});

describe("document edit section lifecycle routing", () => {
  it("reads eager sections from OPEN and never sends them to HYDRATE", async () => {
    const items = contract().sections.find((section) => section.key === "items")!;
    const entry = { key: "items", status: "ok" as const, data: { rows: [] }, timing: { serverMs: 1, cacheHit: "db" as const } };
    const openWorkspace = vi.fn().mockResolvedValue({
      workspaceId: "workspace-token",
      core: {},
      sections: { sections: [entry] },
    });
    const hydrate = vi.fn();

    await expect(loadDocumentEditSectionForLifecycle({
      section: items,
      sectionKey: "items",
      openWorkspace,
      hydrate,
    })).resolves.toEqual(entry);
    expect(openWorkspace).toHaveBeenCalledTimes(1);
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("uses HYDRATE for deferred on-visible sections", async () => {
    const accounting = contract().sections.find((section) => section.key === "accounting")!;
    const entry = { key: "accounting", status: "ok" as const, timing: { serverMs: 1, cacheHit: "db" as const } };
    const openWorkspace = vi.fn();
    const hydrate = vi.fn().mockResolvedValue(entry);

    await expect(loadDocumentEditSectionForLifecycle({
      section: accounting,
      sectionKey: "accounting",
      openWorkspace,
      hydrate,
    })).resolves.toEqual(entry);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(openWorkspace).not.toHaveBeenCalled();
  });
});

const identity: DocumentEditCoordinatorIdentity = {
  tenantId: "tenant-1",
  planeKey: "neon",
  realmKey: "athyper",
  effectivePrincipal: "user-1",
  permissionStamp: "perm-7",
};

function contract(): DocumentEditRuntimeContract {
  return DocumentEditRuntimeContractSchema.parse({
    schemaVersion: DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION,
    kind: "document",
    featureFlag: "editRuntime.purchase_invoice.enabled",
    core: {},
    sections: [
      {
        key: "items",
        label: "Items",
        resolver: "pi_items_section",
        loadPolicy: "eager_parallel",
        cacheTtlMs: 30_000,
        versionRef: "lines_version",
        conflictScope: "items.<lineId>",
        conflictPolicy: "prompt",
        fallbackMode: "degrade",
        timeout: { serverTimeoutMs: 8_000, clientTimeoutMs: 10_000, e2eTargetMs: 1_500 },
        telemetry: { serverBudgetMs: 500, e2eBudgetTargetMs: 1_500 },
      },
      {
        key: "accounting",
        label: "Accounting",
        resolver: "pi_accounting_section",
        loadPolicy: "on_visible",
        cacheTtlMs: 30_000,
        versionRef: "distributions_version",
        conflictScope: "accounting.<distributionId>",
        conflictPolicy: "block",
        fallbackMode: "degrade",
        timeout: { serverTimeoutMs: 8_000, clientTimeoutMs: 10_000, e2eTargetMs: 1_500 },
        telemetry: { serverBudgetMs: 500, e2eBudgetTargetMs: 1_500 },
      },
    ],
    validation: { preflightResolver: "pi_preflight" },
    numberingPolicy: { allocation: "on_submit", rollbackBehavior: "consume" },
    submitPolicy: {
      transactionality: "atomic",
      preflightRequired: true,
      numberingPolicy: "on_submit",
      workflowImpact: "status_only",
    },
    dirtyTracking: "field",
    cachePolicy: {},
    redisPolicy: {},
    sessionPolicy: {
      idleTimeoutMs: 30 * 60_000,
      refreshStrategy: "silent",
      onRevoke: "abort_clear_redirect",
      broadcastChannelName: "athyper-edit-session",
    },
    presencePolicy: {},
    draftPolicy: {
      persistence: "server_draft",
      recoveryPolicy: "prompt",
      autosave: { enabled: true, intervalMs: 30_000, onSectionBlur: true },
      expiryMs: 7 * 24 * 60 * 60_000,
    },
    idempotencyPolicy: {
      identityFields: ["recordId", "sourceField", "newValue", "draftVersion", "clientSeq"],
    },
    sseReactions: {
      "record.changed": { action: "invalidate", target: "core", preserveUi: true },
      "session.revoked": {
        action: "abort_clear_redirect",
        target: "all_principal_cache",
        preserveUi: false,
      },
      "section.changed": { action: "invalidate", target: "section", preserveUi: true },
    },
    telemetry: { requestBudget: 40, duplicateRequestBudget: 0, scrollFetchBudget: 0 },
  });
}

describe("DocumentEditCoordinator helpers", () => {
  it("builds encoded core and section endpoints", () => {
    expect(buildDocumentEditEndpoints("purchase invoice", "id/1")).toMatchObject({
      core: "/api/runtime/v1/entities/purchase%20invoice/id%2F1/edit/core",
      sections: "/api/runtime/v1/entities/purchase%20invoice/id%2F1/edit/sections",
    });
  });

  it("builds stable section query keys with canonical context hashing", () => {
    const c = contract();
    const left = buildDocumentEditSectionQueryKey({
      contract: c,
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
      sectionKey: "items",
      sectionVersion: "v1",
      context: { b: 2, a: 1, skip: undefined },
    });
    const right = buildDocumentEditSectionQueryKey({
      contract: c,
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
      sectionKey: "items",
      sectionVersion: "v1",
      context: { a: 1, b: 2 },
    });
    expect(left).toEqual(right);
  });

  it("marks core/eager sections as autoload and visible/open/action as lazy", () => {
    expect(isDocumentEditSectionAutoLoad("core")).toBe(true);
    expect(isDocumentEditSectionAutoLoad("core_plus_candidates")).toBe(true);
    expect(isDocumentEditSectionAutoLoad("eager_parallel")).toBe(true);
    expect(isDocumentEditSectionAutoLoad("on_visible")).toBe(false);
    expect(isDocumentEditSectionAutoLoad("on_open")).toBe(false);
    expect(isDocumentEditSectionAutoLoad("on_action")).toBe(false);
  });

  it("coalesces repeated invalidations by cache target", () => {
    expect(dedupeDocumentEditInvalidations([
      { type: "section", key: "items" },
      { type: "section", key: "items" },
      { type: "field_options", key: "supplier_id" },
      { type: "field_options", key: "supplier_id" },
      { type: "core", key: "record" },
      { type: "core", key: "status" },
    ])).toEqual([
      { type: "section", key: "items" },
      { type: "field_options", key: "supplier_id" },
      { type: "core", key: "record" },
    ]);
  });

  it("fetches one section from the batch endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sections: [
        {
          key: "items",
          status: "ok",
          version: "v2",
          data: { rows: [] },
          timing: { serverMs: 12, cacheHit: "redis" },
        },
      ],
    }), { status: 200 }));

    await expect(fetchDocumentEditSection({
      fetcher,
      endpoint: "/sections",
      sectionKey: "items",
      context: { company_code_id: "cc-1" },
    })).resolves.toMatchObject({
      key: "items",
      status: "ok",
      version: "v2",
    });

    expect(fetcher).toHaveBeenCalledWith("/sections", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ keys: ["items"], context: { company_code_id: "cc-1" } }),
    }));
  });

  it("sends HYDRATE workspace capability in the header, not the JSON body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sections: {
        sections: [{
          key: "accounting",
          status: "ok",
          data: { rows: [] },
          timing: { serverMs: 4, cacheHit: "none" },
        }],
      },
    }), { status: 200 }));

    await fetchWorkspaceSection({
      fetcher,
      endpoints: buildDocumentEditEndpoints("purchase_invoice", "pi-1"),
      sectionKey: "accounting",
      context: {},
      identity,
      workspaceId: "dew1.key.payload.signature",
    });

    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-document-edit-workspace": "dew1.key.payload.signature",
    });
    expect(JSON.parse(String(init.body))).toEqual({ keys: ["accounting"], context: {} });
  });

  it("refreshes and retries exactly once only for STALE_WORKSPACE", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new DocumentEditRequestError("STALE_WORKSPACE", "stale", 409))
      .mockResolvedValueOnce("ok");
    const refreshWorkspace = vi.fn().mockResolvedValue(undefined);

    await expect(withStaleWorkspaceRetry({ operation, refreshWorkspace })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);

    const alwaysStale = vi.fn().mockRejectedValue(new DocumentEditRequestError("STALE_WORKSPACE", "stale", 409));
    await expect(withStaleWorkspaceRetry({ operation: alwaysStale, refreshWorkspace })).rejects.toMatchObject({
      code: "STALE_WORKSPACE",
    });
    expect(alwaysStale).toHaveBeenCalledTimes(2);

    const invalid = vi.fn().mockRejectedValue(new DocumentEditRequestError("INVALID_WORKSPACE", "invalid", 409));
    const refreshInvalid = vi.fn();
    await expect(withStaleWorkspaceRetry({ operation: invalid, refreshWorkspace: refreshInvalid })).rejects.toMatchObject({
      code: "INVALID_WORKSPACE",
    });
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(refreshInvalid).not.toHaveBeenCalled();
  });

  it("uses discard_draft only for the generic recovery discard endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      operation: "discard_draft",
      draft: { cleared: true, authoritative: false, mode: "recovery_only" },
      invalidations: [{ type: "draft", key: "recovery" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(discardDocumentEditDraft({
      fetcher,
      endpoint: "/edit/discard",
      identity,
      workspaceId: "workspace-token",
      sourceTabId: "tab-1",
    })).resolves.toEqual({ cleared: true });
    const [, init] = fetcher.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      "x-document-edit-workspace": "workspace-token",
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      operation: "discard_draft",
      sourceTabId: "tab-1",
    });
  });

  it("submits workspace changes with all concurrency and idempotency headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      intent: "save",
      record: { id: "po-1", data: { description: "updated" }, status: "draft" },
      etag: "8",
      fieldMask: {},
      sectionMask: {},
      invalidations: [],
      documentVersion: 8,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await fetchDocumentEditSubmit({
      fetcher,
      endpoint: "/api/runtime/v1/entities/purchase_order/po-1/edit/submit",
      identity,
      workspaceId: "workspace-token",
      sourceTabId: "tab-1",
      clientSeq: 4,
      idempotencyKey: "stable-key-4",
      etag: "7",
      intent: "save",
      changes: { lines: { update: [{ id: "line-1", data: { quantity: 2 } }] } },
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/edit/submit");
    expect(url).not.toContain("edit-session");
    expect((init as RequestInit).headers).toMatchObject({
      "x-document-edit-workspace": "workspace-token",
      "if-match": "7",
      "idempotency-key": "stable-key-4",
    });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      intent: "save",
      sourceTabId: "tab-1",
      clientSeq: 4,
    });
  });

  it("retains the same submit attempt for an ambiguous transport retry", () => {
    const attempts = new Map();
    const first = resolveDocumentSubmitAttempt({
      attempts,
      signature: "etag-7:changes-a",
      sourceTabId: "tab-1",
      clientSeq: 5,
    });
    const retry = resolveDocumentSubmitAttempt({
      attempts,
      signature: "etag-7:changes-a",
      sourceTabId: "tab-1",
      clientSeq: 6,
    });
    const changedRequest = resolveDocumentSubmitAttempt({
      attempts,
      signature: "etag-8:changes-a",
      sourceTabId: "tab-1",
      clientSeq: 6,
    });

    expect(retry).toEqual(first);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.clientSeq).toBe(5);
    expect(changedRequest.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("scopes recovery to identity, permissions, plan, entity, and record and clears it on logout", () => {
    const first = documentEditWorkspaceRecoveryKey({
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
      planHash: "plan-1",
    });
    const second = documentEditWorkspaceRecoveryKey({
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity: { ...identity, permissionStamp: "perm-8" },
      planHash: "plan-1",
    });
    expect(first).not.toBe(second);

    const values = new Map<string, string>([
      [first, "token-1"],
      [second, "token-2"],
      ["unrelated", "keep"],
    ]);
    const storage = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      getItem(key: string) { return values.get(key) ?? null; },
      removeItem(key: string) { values.delete(key); },
    };
    expect(findDocumentEditWorkspaceRecovery(storage, {
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
    })).toEqual({ key: first, workspaceId: "token-1" });
    clearDocumentEditWorkspaceRecovery(storage);
    expect([...values.entries()]).toEqual([["unrelated", "keep"]]);
  });

  it("removes core cache for abort_clear_redirect reactions", async () => {
    const c = contract();
    const queryClient = new QueryClient();
    const coreKey = buildDocumentEditCoreQueryKey({
      contract: c,
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
    });
    queryClient.setQueryData(coreKey, { ok: true });

    await applyDocumentEditReaction({
      queryClient,
      reaction: c.sseReactions["session.revoked"],
      contract: c,
      entityCode: "purchase_invoice",
      recordId: "pi-1",
      identity,
    });

    expect(queryClient.getQueryData(coreKey)).toBeUndefined();
  });
});

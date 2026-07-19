import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import type { EffectiveRecordWorkspaceManifest } from "@athyper/runtime-contracts";
import { createDefaultRecordWorkspaceAdapters } from "./adapters";
import { createRecordWorkspaceQueryDefinition } from "./hooks";
import {
  invalidateRecordWorkspaceChildCollection,
  invalidateRecordWorkspaceProcessResources,
  invalidateRecordWorkspaceSnapshotResources,
} from "./invalidation";

const manifest: EffectiveRecordWorkspaceManifest = {
  schemaVersion: "record-workspace-manifest/v1",
  definitionVersion: "record-workspace/v1",
  entityCode: "journal_entry",
  recordId: "record-1",
  renderer: "ledger",
  initialSurfaceKey: "details",
  cacheScope: {
    kind: "principal_record",
    key: "scope-a",
    variesBy: ["tenant", "principal", "permission_stamp", "descriptor", "entity", "record", "record_state"],
  },
  recordState: {
    lifecycleState: "posted",
    terminal: false,
    allowedTransitions: [],
    workflowStatus: null,
    pendingWorkflowTasks: 0,
  },
  surfaces: [{
    key: "details",
    kind: "fields",
    placement: "main",
    order: 0,
    enabled: true,
  }],
  resources: [{ key: "activity" }],
  operations: [],
};

const keyInput = {
  entityCode: manifest.entityCode,
  recordId: manifest.recordId,
  cacheScopeKey: manifest.cacheScope.key,
};

describe("record workspace canonical queries", () => {
  it("canonicalizes collection params and security-isolates the key root", () => {
    const left = queryKeys.recordWorkspace.activity(keyInput, { page: 2, query: "cash" });
    const right = queryKeys.recordWorkspace.activity(keyInput, { query: "cash", page: 2 });
    const otherScope = queryKeys.recordWorkspace.activity({
      ...keyInput,
      cacheScopeKey: "scope-b",
    }, { page: 2, query: "cash" });

    expect(left).toEqual(right);
    expect(left).not.toEqual(otherScope);
    expect(queryKeys.recordWorkspace.commentEnrichment(keyInput, ["b", "a", "b"]))
      .toEqual(queryKeys.recordWorkspace.commentEnrichment(keyInput, ["a", "b"]));
  });

  it("keeps graph snapshots separate from lifecycle transitions and preserves compare side order", () => {
    expect(queryKeys.recordWorkspace.snapshots(keyInput)).not.toEqual(
      queryKeys.recordWorkspace.lifecycleTimeline(keyInput),
    );
    expect(queryKeys.recordWorkspace.snapshotCompare(keyInput, "left", "right")).not.toEqual(
      queryKeys.recordWorkspace.snapshotCompare(keyInput, "right", "left"),
    );
  });

  it("deduplicates concurrent consumers of the same canonical query", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let release: ((value: { data: string }) => void) | undefined;
    const adapter = vi.fn(() => new Promise<{ data: string }>((resolve) => {
      release = resolve;
    }));
    const definition = createRecordWorkspaceQueryDefinition({
      queryKey: queryKeys.recordWorkspace.activity(keyInput),
      queryFn: adapter,
      staleTime: 30_000,
    });

    const first = queryClient.fetchQuery(definition);
    const second = queryClient.fetchQuery(definition);
    expect(adapter).toHaveBeenCalledTimes(1);

    release?.({ data: "ready" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: "ready" },
      { data: "ready" },
    ]);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh first-intent process resource without another request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const adapter = vi.fn(async () => ({ data: [{ id: "approval-1" }] }));
    const definition = createRecordWorkspaceQueryDefinition({
      queryKey: queryKeys.recordWorkspace.approvals(keyInput),
      queryFn: adapter,
      staleTime: 30_000,
    });

    await queryClient.fetchQuery(definition);
    await queryClient.fetchQuery(definition);

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("honors a resource-level no-retry policy over the application default", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1 } },
    });
    const adapter = vi.fn(async () => {
      throw new Error("deterministic collaboration failure");
    });
    const definition = createRecordWorkspaceQueryDefinition({
      queryKey: queryKeys.recordWorkspace.comments(keyInput),
      queryFn: adapter,
      retry: false,
    });

    await expect(queryClient.fetchQuery(definition)).rejects.toThrow(
      "deterministic collaboration failure",
    );
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("invalidates canonical process projections after workflow mutations", async () => {
    const queryClient = new QueryClient();
    const keys = [
      queryKeys.recordWorkspace.recordCore(keyInput),
      queryKeys.recordWorkspace.processState(keyInput),
      queryKeys.recordWorkspace.approvals(keyInput),
      queryKeys.recordWorkspace.lifecycleTimeline(keyInput),
    ];
    const untouched = queryKeys.recordWorkspace.activity(keyInput);
    keys.forEach((key) => queryClient.setQueryData(key, { ready: true }));
    queryClient.setQueryData(untouched, { ready: true });

    await invalidateRecordWorkspaceProcessResources(queryClient, keyInput);

    keys.forEach((key) => {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    });
    expect(queryClient.getQueryState(untouched)?.isInvalidated).toBe(false);
  });

  it("invalidates every page of one collection without invalidating siblings", async () => {
    const queryClient = new QueryClient();
    const first = queryKeys.recordWorkspace.childCollection(keyInput, "lines", { page: 1, page_size: 25 });
    const second = queryKeys.recordWorkspace.childCollection(keyInput, "lines", { page: 2, page_size: 25 });
    const sibling = queryKeys.recordWorkspace.childCollection(keyInput, "schedules", { page: 1, page_size: 25 });
    queryClient.setQueryData(first, { records: [] });
    queryClient.setQueryData(second, { records: [] });
    queryClient.setQueryData(sibling, { records: [] });

    await invalidateRecordWorkspaceChildCollection(queryClient, keyInput, "lines");

    expect(queryClient.getQueryState(first)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(second)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(sibling)?.isInvalidated).toBe(false);
  });

  it("invalidates snapshot history alone for capture events and the live graph after restore", async () => {
    const queryClient = new QueryClient();
    const index = queryKeys.recordWorkspace.snapshots(keyInput);
    const detail = queryKeys.recordWorkspace.snapshot(keyInput, "snapshot-1");
    const record = queryKeys.recordWorkspace.recordCore(keyInput);
    const lines = queryKeys.recordWorkspace.childCollection(keyInput, "lines");
    queryClient.setQueryData(index, { data: [] });
    queryClient.setQueryData(detail, { id: "snapshot-1" });
    queryClient.setQueryData(record, { id: "record-1" });
    queryClient.setQueryData(lines, { records: [] });

    await invalidateRecordWorkspaceSnapshotResources(queryClient, keyInput);

    expect(queryClient.getQueryState(index)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detail)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(record)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(lines)?.isInvalidated).toBe(false);

    await invalidateRecordWorkspaceSnapshotResources(queryClient, keyInput, { recordChanged: true });

    expect(queryClient.getQueryState(record)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(lines)?.isInvalidated).toBe(true);
  });

  it("uses canonical snapshot detail, compare, and restore transports", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const adapters = createDefaultRecordWorkspaceAdapters(fetcher);
    const base = {
      manifest,
      entityCode: manifest.entityCode,
      recordId: manifest.recordId,
      signal: new AbortController().signal,
    };

    await adapters.snapshotDetail({ ...base, snapshotId: "snapshot-1" });
    await adapters.snapshotCompare({
      ...base,
      leftSnapshotId: "snapshot-1",
      rightSnapshotId: "snapshot-2",
    });
    await adapters.snapshotRestore({ ...base, snapshotId: "snapshot-1" });

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/runtime/v1/entities/journal_entry/record-1/snapshots/snapshot-1",
      "/api/runtime/v1/entities/journal_entry/record-1/snapshots/compare",
      "/api/runtime/v1/entities/journal_entry/record-1/snapshots/snapshot-1/restore",
    ]);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ leftSnapshotId: "snapshot-1", rightSnapshotId: "snapshot-2" }),
    });
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
  });

  it("uses only the explicit child collection source selected from metadata", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ records: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const adapters = createDefaultRecordWorkspaceAdapters(fetcher);
    await adapters.childCollection({
      manifest,
      entityCode: manifest.entityCode,
      recordId: manifest.recordId,
      signal: new AbortController().signal,
      collectionKey: "ui-lines-key",
      source: { kind: "relation", relationCode: "declared_lines" },
      params: { page: 2, page_size: 25 },
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/runtime/v1/entities/journal_entry/relations/declared_lines/records/record-1?page=2&page_size=25",
    );
  });

  it("wraps the existing resource routes without issuing eager requests", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const adapters = createDefaultRecordWorkspaceAdapters(fetcher);
    expect(fetcher).not.toHaveBeenCalled();

    await adapters.activity({
      manifest,
      entityCode: manifest.entityCode,
      recordId: manifest.recordId,
      signal: new AbortController().signal,
      params: { page: 1 },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/relay/api/activity/journal_entry/record-1?page=1",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("uses one enriched comments request and one attachment workspace request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const adapters = createDefaultRecordWorkspaceAdapters(fetcher);
    const base = {
      manifest,
      entityCode: manifest.entityCode,
      recordId: manifest.recordId,
      signal: new AbortController().signal,
    };

    await adapters.comments({ ...base, params: { offset: 0 } });
    await adapters.attachmentWorkspace(base);

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/collab/comments?entityType=journal_entry&entityId=record-1&limit=50&offset=0",
      "/api/relay/api/documents/journal_entry/record-1/attachment-workspace",
    ]);
  });
});

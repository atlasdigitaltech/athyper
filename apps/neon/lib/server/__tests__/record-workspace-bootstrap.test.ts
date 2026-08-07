import { describe, expect, it, vi } from "vitest";
import { QueryClient, hydrate } from "@tanstack/react-query";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { compileMetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  RECORD_WORKSPACE_BOOTSTRAP_STALE_TIME_MS,
  loadRecordWorkspaceBootstrap,
  settleRecordWorkspaceOptionalLoaders,
} from "../record-workspace-bootstrap";

describe("record workspace server bootstrap", () => {
  it("loads core resources once and hydrates them without an immediate browser refetch", async () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      entity_code: "journal_entry",
      entity_name: "Journal Entry",
      entity_class: "LEDGER",
      table_schema: "accounting",
      table_name: "journal_entry",
      fields: [{ name: "name", label: "Name", data_type: "text" }],
      display_config: { detail_renderer: "ledger" },
      feature_flags: { has_attachments: false },
    });
    const record = { id: "record-1", name: "Opening Balance", status: "posted" };
    const processState = {
      entityCode: "journal_entry",
      recordId: "record-1",
      lifecycle: {
        currentState: "posted",
        source: "record_status" as const,
        allowedTransitions: [],
        terminal: false,
      },
    };
    const loadDescriptor = vi.fn(async () => descriptor);
    const loadRecord = vi.fn(async () => ({
      record: record as never,
      state: { status: "ready" as const },
    }));
    const loadProcessState = vi.fn(async () => processState);

    const bootstrap = await loadRecordWorkspaceBootstrap("journal_entry", "record-1", {
      dependencies: {
        loadDescriptor,
        loadRecord,
        loadProcessState,
        loadSession: async () => session(),
      },
    });

    expect(loadDescriptor).toHaveBeenCalledTimes(1);
    expect(loadRecord).toHaveBeenCalledTimes(1);
    expect(loadProcessState).toHaveBeenCalledTimes(1);
    expect(bootstrap.record).toMatchObject(record);
    expect(bootstrap.manifest).toBeDefined();

    const browserQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    hydrate(browserQueryClient, bootstrap.dehydratedState);
    const keyInput = {
      entityCode: bootstrap.manifest!.entityCode,
      recordId: bootstrap.manifest!.recordId,
      cacheScopeKey: bootstrap.manifest!.cacheScope.key,
    };
    const coreRefetch = vi.fn(async () => ({ ok: true, record: { id: "duplicate" } }));
    const processRefetch = vi.fn(async () => ({ ok: true, processState: null }));

    const [hydratedCore, hydratedProcess] = await Promise.all([
      browserQueryClient.fetchQuery({
        queryKey: queryKeys.recordWorkspace.recordCore(keyInput),
        queryFn: coreRefetch,
        staleTime: RECORD_WORKSPACE_BOOTSTRAP_STALE_TIME_MS,
      }),
      browserQueryClient.fetchQuery({
        queryKey: queryKeys.recordWorkspace.processState(keyInput),
        queryFn: processRefetch,
        staleTime: RECORD_WORKSPACE_BOOTSTRAP_STALE_TIME_MS,
      }),
    ]);

    expect(coreRefetch).not.toHaveBeenCalled();
    expect(processRefetch).not.toHaveBeenCalled();
    expect(hydratedCore).toMatchObject({ ok: true, record });
    expect(hydratedProcess).toEqual({ ok: true, processState });
  });

  it("returns ready optional values without waiting indefinitely for pending loaders", async () => {
    const never = new Promise<never>(() => undefined);
    const result = await settleRecordWorkspaceOptionalLoaders({
      editCoordinatorIdentity: () => never,
    }, 5);

    expect(result.ready).toEqual({});
    expect(result.pending).toEqual(["editCoordinatorIdentity"]);
    expect(result.failures).toEqual([]);
  });

  it("isolates optional loader failures from successful resources", async () => {
    const result = await settleRecordWorkspaceOptionalLoaders({
      editCoordinatorIdentity: async () => {
        throw new Error("identity unavailable");
      },
    }, 50);

    expect(result.ready).toEqual({});
    expect(result.pending).toEqual([]);
    expect(result.failures).toEqual([{
      key: "editCoordinatorIdentity",
      message: "identity unavailable",
    }]);
  });
});

function session(): V4Session {
  return {
    version: 4,
    sid: "sid-1",
    sessionNamespace: "tenant-1",
    userId: "user-1",
    username: "user-1",
    email: "user@example.com",
    displayName: "User One",
    activeOrg: "athyper",
    activeWorkbench: "user",
    organizations: {
      athyper: {
        id: "org-1",
        name: "Athyper",
        alias: "athyper",
        tenantId: "tenant-1",
        roles: ["user"],
        contextType: "legal_entity",
      },
    },
    planeKey: "neon",
    realmKey: "tenant-control",
  } as unknown as V4Session;
}

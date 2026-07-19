import "server-only";

import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import {
  buildSessionConfigurationIdentity,
  getSessionConfiguration,
  type SessionConfigurationCacheDiagnostic,
} from "@/lib/server/session-configuration-cache";
import type { RuntimeListDiagnosticRecorder } from "@/lib/server/runtime-list-observability";

type RuntimeListState = {
  search?: string;
  searchMode?: "server" | "client";
  sort?: Array<{ key: string; dir: "asc" | "desc" }>;
  filters?: Record<string, string[]>;
  group?: string;
  page?: number;
  pageSize?: number;
  viewMode?: "list" | "compact" | "board" | "dashboard" | "excel";
  columns?: string[];
  density?: "compact" | "comfortable" | "spacious";
  facets?: "cheap" | "all";
  pinnedCols?: string[];
};

type SavedView = {
  id:          string;
  name:        string;
  is_default?: boolean;
  is_shared?:  boolean;
  can_delete?: boolean;
  scope?:      "private" | "shared" | "system";
  created_at?: string;
  updated_at?: string;
  state?:      Partial<RuntimeListState>;
  config?:     Partial<RuntimeListState> & Record<string, unknown>;
};

interface RuntimeSavedViewRecord {
  id:          string;
  entity_code?: string;
  name:        string;
  is_default?: boolean;
  is_shared?:  boolean;
  can_delete?: boolean;
  scope?:       "private" | "shared" | "system";
  config?:     Partial<RuntimeListState>;
  created_at?: string;
  updated_at?: string;
}

const SAVED_VIEW_POLICY = {
  freshForMs: 30_000,
  staleForMs: 2 * 60_000,
} as const;

export async function getRuntimeSavedViews(
  entityCode: string,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<SavedView[]> {
  const records = await fetchRuntimeSavedViewRecords(entityCode, diagnostics);
  return records.map((view) => ({
    id:         view.id,
    name:       view.name,
    is_default: Boolean(view.is_default),
    is_shared:  Boolean(view.is_shared),
    can_delete: Boolean(view.can_delete),
    scope:      view.scope ?? (view.is_shared ? "shared" : "private"),
    created_at: view.created_at,
    updated_at: view.updated_at,
    state:      view.config,
    config:     view.config,
  }));
}

export async function getRuntimeSavedViewState(
  entityCode: string,
  viewId:     string,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<Partial<RuntimeListState> | null> {
  const records = await fetchRuntimeSavedViewRecords(entityCode, diagnostics);
  const view = records.find((item) => item.id === viewId);
  return view?.config ?? null;
}

async function fetchRuntimeSavedViewRecords(
  entityCode: string,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<RuntimeSavedViewRecord[]> {
  const session = await getNeonServerSession();
  if (!session) return [];
  const sessionIdentity = buildSessionConfigurationIdentity(session);
  if (!sessionIdentity) return [];

  try {
    return await getSessionConfiguration({
      namespace: "saved_views",
      sessionIdentity,
      keyParts: { entityCode },
      policy: SAVED_VIEW_POLICY,
      loader: async () => {
        const response = await fetch(
          buildRuntimeUrl(`/api/platform/saved-views/${encodeURIComponent(entityCode)}`),
          {
            headers: buildRuntimeHeaders(session),
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error(`Saved views returned ${response.status}.`);

        const json = await response.json() as unknown;
        const items = Array.isArray(json)
          ? json
          : isRecord(json) && Array.isArray(json["data"]) ? json["data"] : null;
        if (!items) throw new Error("Saved views response was malformed.");

        return items.flatMap((item) => {
          const view = normalizeSavedViewRecord(item);
          return view ? [view] : [];
        });
      },
      onDiagnostic: diagnostics
        ? (event) => recordSavedViewDiagnostic(diagnostics, event)
        : undefined,
    });
  } catch {
    return [];
  }
}

function recordSavedViewDiagnostic(
  diagnostics: RuntimeListDiagnosticRecorder,
  event: SessionConfigurationCacheDiagnostic,
): void {
  diagnostics.record("saved_views", event.durationMs, event.cacheState);
}

function normalizeSavedViewRecord(value: unknown): RuntimeSavedViewRecord | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value["id"]);
  const name = stringValue(value["name"]);
  if (!id || !name) return null;

  return {
    id,
    name,
    entity_code: stringValue(value["entity_code"]),
    is_default:  Boolean(value["is_default"]),
    is_shared:   Boolean(value["is_shared"]),
    can_delete:  Boolean(value["can_delete"]),
    scope:       normalizeSavedViewScope(value["scope"]),
    config:      isRecord(value["config"]) ? value["config"] as Partial<RuntimeListState> : undefined,
    created_at:  stringValue(value["created_at"]),
    updated_at:  stringValue(value["updated_at"]),
  };
}

function normalizeSavedViewScope(value: unknown): RuntimeSavedViewRecord["scope"] {
  if (value === "system" || value === "shared" || value === "private") return value;
  if (value === "personal") return "private";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

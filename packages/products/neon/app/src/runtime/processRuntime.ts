import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type {
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
  RuntimeOperationExecutionInput,
  RuntimeOperationExecutionResult,
} from "@athyper/runtime-contracts";

export interface NeonRuntimeRecord {
  id?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NeonRuntimeDetailBundle {
  descriptor: MetaEntityRuntimeDescriptor;
  record?: NeonRuntimeRecord;
  processState?: ProcessRuntimeState;
}

export interface NeonProcessRuntimeConfig {
  fetchProcessState?: (
    entityCode: string,
    recordId: string,
  ) => Promise<ProcessRuntimeState | null>;
  executeOperation?: (
    input: RuntimeOperationExecutionInput,
  ) => Promise<RuntimeOperationExecutionResult>;
  processStateApiHref?: (entityCode: string, recordId: string) => string;
  operationApiHref?: (entityCode: string, operationCode: string, recordId?: string) => string;
  headers?: () => Record<string, string>;
}

export interface NeonProcessRuntimeAdapter {
  fetchProcessState(entityCode: string, recordId: string): Promise<ProcessRuntimeState | null>;
  executeOperation(input: RuntimeOperationExecutionInput): Promise<RuntimeOperationExecutionResult>;
  processStateApiHref(entityCode: string, recordId: string): string;
  operationApiHref(entityCode: string, operationCode: string, recordId?: string): string;
}

export function createNeonProcessRuntimeAdapter(
  config: NeonProcessRuntimeConfig = {},
): NeonProcessRuntimeAdapter {
  const processStateApiHref = config.processStateApiHref ?? defaultProcessStateApiHref;
  const operationApiHref = config.operationApiHref ?? defaultOperationApiHref;

  return {
    processStateApiHref,
    operationApiHref,

    async fetchProcessState(entityCode, recordId) {
      if (config.fetchProcessState) {
        return config.fetchProcessState(entityCode, recordId);
      }

      const response = await fetch(processStateApiHref(entityCode, recordId), {
        headers: config.headers?.(),
        cache: "no-store",
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Failed to fetch process state (${response.status}).`);
      }

      const body = await response.json().catch(() => null) as unknown;
      return readProcessState(body);
    },

    async executeOperation(input) {
      if (config.executeOperation) {
        return config.executeOperation(input);
      }

      const response = await fetch(operationApiHref(input.entityCode, input.operationCode, input.recordId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.headers?.() ?? {}),
        },
        body: JSON.stringify(input),
      });

      const body = await response.json().catch(() => null) as RuntimeOperationExecutionResult | null;
      if (!response.ok) {
        return body?.errors
          ? body
          : { errors: [{ code: String(response.status), message: `Operation failed (${response.status}).` }] };
      }
      return body ?? {};
    },
  };
}

function defaultProcessStateApiHref(entityCode: string, recordId: string): string {
  return runtimePath.processState(entityCode, recordId);
}

function defaultOperationApiHref(entityCode: string, operationCode: string, recordId?: string): string {
  // Stub default — consumers typically override via NeonProcessRuntimeConfig.operationApiHref.
  // No BFF route exists at this path today; kept under v1/entities for forward-compatibility.
  const base = `/api/runtime/v1/entities/${encodeURIComponent(entityCode)}/operations/${encodeURIComponent(operationCode)}`;
  return recordId ? `${base}?recordId=${encodeURIComponent(recordId)}` : base;
}

function readProcessState(body: unknown): ProcessRuntimeState | null {
  if (!isRecord(body)) return null;
  if (isRecord(body["processState"])) return body["processState"] as ProcessRuntimeState;
  if (typeof body["entityCode"] === "string" && typeof body["recordId"] === "string") {
    return body as ProcessRuntimeState;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

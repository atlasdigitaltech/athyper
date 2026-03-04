/**
 * API Sync Worker
 *
 * Processes API synchronization jobs: fetch data from an external API,
 * map fields to internal model, and upsert into the platform.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { Job, JobHandler } from "@athyper/core";

// ============================================================================
// Types
// ============================================================================

export interface ApiSyncPayload {
  /** Source API endpoint */
  sourceUrl: string;
  /** HTTP method for source (default GET) */
  sourceMethod?: "GET" | "POST";
  /** Source request headers (e.g., Authorization) */
  sourceHeaders?: Record<string, string>;
  /** Source request body (for POST) */
  sourceBody?: unknown;
  /** Timeout in milliseconds (default 30000) */
  timeoutMs?: number;
  /** JSON path to extract records from response (e.g., "data.items") */
  recordsPath?: string;
  /** Field mapping: { internalField: sourceField } */
  fieldMapping: Record<string, string>;
  /** Target entity type in the platform */
  targetEntityType: string;
  /** Upsert key fields for deduplication */
  upsertKeys: string[];
  /** Target API endpoint for upsert */
  targetUrl: string;
  /** Target headers */
  targetHeaders?: Record<string, string>;
  /** Tenant ID */
  tenantId: string;
  /** Correlation ID */
  correlationId?: string;
}

export interface ApiSyncResult {
  success: boolean;
  recordsFetched: number;
  recordsUpserted: number;
  recordsFailed: number;
  errors: string[];
  durationMs: number;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createApiSyncHandler(
  logger: Logger,
): JobHandler<ApiSyncPayload, ApiSyncResult> {
  return async (job: Job<ApiSyncPayload>): Promise<ApiSyncResult> => {
    const payload = job.data.payload;
    const startTime = Date.now();

    logger.info({
      msg: "api_sync_started",
      jobId: job.id,
      sourceUrl: redactUrl(payload.sourceUrl),
      targetEntity: payload.targetEntityType,
      tenantId: payload.tenantId,
    });

    try {
      // 1. Fetch from source API
      const sourceRecords = await fetchSourceData(payload, logger);

      logger.info({
        msg: "api_sync_fetched",
        jobId: job.id,
        recordCount: sourceRecords.length,
      });

      // 2. Map fields
      const mappedRecords = sourceRecords.map(
        (record: Record<string, unknown>) =>
          mapFields(record, payload.fieldMapping),
      );

      // 3. Upsert to target
      let upserted = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const record of mappedRecords) {
        try {
          await upsertRecord(payload, record, logger);
          upserted++;
        } catch (err) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errors.length < 10) {
            errors.push(errorMsg);
          }
        }
      }

      const durationMs = Date.now() - startTime;

      logger.info({
        msg: "api_sync_completed",
        jobId: job.id,
        recordsFetched: sourceRecords.length,
        recordsUpserted: upserted,
        recordsFailed: failed,
        durationMs,
      });

      return {
        success: failed === 0,
        recordsFetched: sourceRecords.length,
        recordsUpserted: upserted,
        recordsFailed: failed,
        errors,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error({
        msg: "api_sync_error",
        jobId: job.id,
        error: errorMsg,
        durationMs,
      });

      throw err;
    }
  };
}

// ============================================================================
// Helpers
// ============================================================================

async function fetchSourceData(
  payload: ApiSyncPayload,
  logger: Logger,
): Promise<Record<string, unknown>[]> {
  const method = payload.sourceMethod ?? "GET";
  const timeoutMs = payload.timeoutMs ?? 30_000;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(payload.sourceUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(payload.sourceHeaders ?? {}),
      },
      body: payload.sourceBody ? JSON.stringify(payload.sourceBody) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Source API returned ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Extract records using path
    if (payload.recordsPath) {
      const records = getNestedValue(data, payload.recordsPath);
      if (!Array.isArray(records)) {
        throw new Error(
          `Records path '${payload.recordsPath}' did not resolve to an array`,
        );
      }
      return records as Record<string, unknown>[];
    }

    // If response is an array, use directly
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }

    // Single record
    return [data];
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function mapFields(
  source: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetField, sourcePath] of Object.entries(mapping)) {
    result[targetField] = getNestedValue(source, sourcePath);
  }

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

async function upsertRecord(
  payload: ApiSyncPayload,
  record: Record<string, unknown>,
  _logger: Logger,
): Promise<void> {
  const response = await fetch(payload.targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": payload.tenantId,
      ...(payload.targetHeaders ?? {}),
    },
    body: JSON.stringify({
      entityType: payload.targetEntityType,
      upsertKeys: payload.upsertKeys,
      data: record,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Upsert failed (${response.status}): ${body.substring(0, 200)}`,
    );
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "***";
  }
}

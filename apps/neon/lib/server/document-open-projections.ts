import "server-only";

import type { V4Session } from "@athyper/auth-bff";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  getChildRuntimeProjection,
  getCompiledEntityRuntimeMetadata,
} from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

export interface DocumentRuleProjection {
  entity: string;
  field_rules: Record<string, unknown>;
  action_rules: Record<string, unknown>;
  version: string;
}

export async function loadDocumentRuleProjection(input: {
  session: V4Session;
  entityCode: string;
  signal?: AbortSignal;
}): Promise<DocumentRuleProjection> {
  const upstream = await fetch(buildRuntimeUrl(runtimeServerPath.rules(input.entityCode)), {
    headers: buildRuntimeHeaders(input.session),
    cache: "no-store",
    signal: input.signal,
  });
  if (!upstream.ok) {
    const error = new Error(`Rules upstream returned ${upstream.status}.`);
    Object.assign(error, { status: upstream.status });
    throw error;
  }
  const body = await upstream.json() as Record<string, unknown>;
  return {
    entity: typeof body["entity"] === "string" ? body["entity"] : input.entityCode,
    field_rules: isRecord(body["field_rules"]) ? body["field_rules"] : {},
    action_rules: isRecord(body["action_rules"]) ? body["action_rules"] : {},
    version: readVersion(body),
  };
}

export async function loadDocumentChildCompiledProjections(input: {
  session: V4Session;
  descriptor: MetaEntityRuntimeDescriptor;
}): Promise<Record<string, CompiledEntity>> {
  const entityCodes = [...new Set(
    (input.descriptor.editRuntime?.childCollections ?? [])
      .map((collection) => collection.entityCode.trim().replace(/-/g, "_"))
      .filter(Boolean),
  )];
  const entries = await Promise.all(entityCodes.map(async (entityCode) => {
    const reused = getChildRuntimeProjection(input.descriptor, entityCode);
    const compiled = reused?.compiled ?? await getCompiledEntityRuntimeMetadata(entityCode, input.session);
    const relation = input.descriptor.relations.find((candidate) => candidate.targetEntity === entityCode);
    const capabilities = reused?.descriptor.capabilities ?? relation?.mutationPermissions;
    return compiled ? [entityCode, projectCompiledEntity(compiled, capabilities)] as const : null;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, CompiledEntity] => entry !== null));
}

function projectCompiledEntity(
  entity: CompiledEntity,
  operationCapabilities?: { canRead?: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean },
): CompiledEntity {
  return {
    ...entity,
    relations: [],
    display_config: {
      title_field: entity.display_config.title_field,
      subtitle_field: entity.display_config.subtitle_field,
      list_columns: entity.display_config.list_columns,
      mobile_columns: entity.display_config.mobile_columns,
      line_summary_strip: entity.display_config.line_summary_strip,
    },
    document_runtime_plan: undefined,
    operation_capabilities: operationCapabilities ?? {
      canRead: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    },
  } as CompiledEntity;
}

function readVersion(body: Record<string, unknown>): string {
  for (const key of ["version", "version_hash", "compiled_hash"] as const) {
    const value = body[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "unversioned";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

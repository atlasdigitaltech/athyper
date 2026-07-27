import { notFound } from "next/navigation";
import { RuntimeNewPage } from "@athyper/runtime-canvas";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";
import { getNeonServerSession } from "@/lib/server/session";
import { resolveFxRateTenantCode } from "@/lib/server/fx-rate-runtime-context";
import { FxRateGovernedForm } from "../FxRateGovernedForm";
import { EarlyDraftLauncher } from "./EarlyDraftLauncher";
import { DirectCreateLauncher } from "./DirectCreateLauncher";
import { SourceDocumentCreateLauncher } from "./SourceDocumentCreateLauncher";

export default async function RuntimeNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if(entity==="fx_policy")notFound();
  if(entity==="fx_rate"&&descriptor){
    const session=await getNeonServerSession();
    const tenantCode=session?resolveFxRateTenantCode(session):null;
    if(!tenantCode)notFound();
    const resolvedSearchParams=await searchParams;
    return (
      <FxRateGovernedForm
        tenantCode={tenantCode}
        descriptor={descriptor}
        mode="create"
        record={buildInitialRecord(descriptor,resolvedSearchParams)}
      />
    );
  }
  if (descriptor?.createMode === "EARLY_DRAFT") {
    return <EarlyDraftLauncher entity={descriptor.entityCode} />;
  }
  if (descriptor?.createMode === "DIRECT_CREATE") {
    return <DirectCreateLauncher entity={descriptor.entityCode} editAfterCreate={descriptor.renderer === "document"} />;
  }
  if (descriptor?.createMode === "SOURCE_DOCUMENT_CREATE") {
    const resolvedSearchParams = await searchParams;
    return (
      <SourceDocumentCreateLauncher
        entity={descriptor.entityName}
        sourceEntity={firstSearchParam(resolvedSearchParams["sourceEntity"])
          ?? resolveSourceEntity(resolveSourceCreateOperation(descriptor.operations)?.key)}
        operation={resolveSourceCreateOperation(descriptor.operations)}
      />
    );
  }
  const resolvedSearchParams = await searchParams;
  const copyFrom = firstSearchParam(resolvedSearchParams["copyFrom"]);
  const copyDetail = copyFrom && descriptor
    ? await getMetaEntityRecordDetail(entity, copyFrom, descriptor)
    : undefined;

  return (
    <RuntimeNewPage
      plane={PLANE_KEY}
      entity={entity}
      descriptor={descriptor}
      copyRecord={copyDetail?.record}
      initialRecord={descriptor ? buildInitialRecord(descriptor, resolvedSearchParams) : undefined}
    />
  );
}

function resolveSourceEntity(operationKey: string | undefined): string | undefined {
  const source = operationKey?.split("_from_")[1];
  if (!source) return undefined;
  // commitment is the internal aggregate; purchase_order is its public meta entity.
  return source === "commitment" ? "purchase_order" : source;
}

function resolveSourceCreateOperation(operations: MetaEntityRuntimeDescriptor["operations"]): { key: string; label?: string | null; href: string } | undefined {
  const operation = operations.find((candidate) => candidate.enabled
    && candidate.handlerType === "API"
    && (candidate.key.includes("_from_") || candidate.handlerTarget?.includes("_from_")));
  const target = operation?.handlerTarget ?? operation?.key;
  return operation && target
    ? { key: operation.key, label: operation.label, href: `/p2p/${target.replace(/_/g, "-")}` }
    : undefined;
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return item && item.trim() ? item.trim() : undefined;
}

function buildInitialRecord(
  descriptor: MetaEntityRuntimeDescriptor,
  searchParams: Record<string, string | string[] | undefined>,
): RuntimeRecordRow | undefined {
  const fieldNames = new Set(descriptor.fields.map((field) => field.name));
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "copyFrom" || !fieldNames.has(key)) continue;
    const item = firstSearchParam(value);
    if (item !== undefined) data[key] = item;
  }
  return Object.keys(data).length > 0 ? { data } : undefined;
}

import { RuntimeNewPage } from "@athyper/runtime-canvas";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";

export default async function RuntimeNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
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

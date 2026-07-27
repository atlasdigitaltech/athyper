import { notFound } from "next/navigation";
import {
  RuntimeDetailPage,
  resolveRuntimeObjectPageRenderer,
} from "@athyper/runtime-canvas";

import {
  getMeshRuntimeDescriptor,
  getMeshRuntimeCatalog,
  getMeshRuntimeRecord,
} from "@/lib/server/mesh-runtime";
import { PLANE_KEY } from "@/lib/plane";
import MeshDocumentObjectPageClient from "./MeshDocumentObjectPageClient";

const VALID_ENTITY_CODE = /^[a-z][a-z0-9_]*$/;

export default async function RuntimeDetailRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  if (!VALID_ENTITY_CODE.test(entityCode) || !id.trim()) notFound();

  // Both calls independently hit request-authorized server boundaries. A
  // direct URL therefore cannot bypass plane eligibility or the record grant.
  const [descriptor, record, catalog] = await Promise.all([
    getMeshRuntimeDescriptor(entityCode),
    getMeshRuntimeRecord(entityCode, id),
    getMeshRuntimeCatalog(),
  ]);
  if (!descriptor
      || !record
      || !catalog.some((item) => item.entityCode === entityCode && item.detail)) notFound();

  if (resolveRuntimeObjectPageRenderer(descriptor) === "document") {
    return (
      <MeshDocumentObjectPageClient
        entityCode={entityCode}
        recordId={id}
        recordUuid={typeof record.id === "string" && record.id ? record.id : id}
        descriptor={descriptor}
        record={record}
      />
    );
  }

  return (
    <RuntimeDetailPage
      plane={PLANE_KEY}
      entity={entityCode}
      id={id}
      descriptor={descriptor}
      record={record}
    />
  );
}

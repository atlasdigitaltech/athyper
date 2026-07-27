import { notFound } from "next/navigation";
import { toRuntimeDescriptor } from "@athyper/runtime-list/adapter";
import { MeshListPage } from "@athyper/app-mesh/list";
import {
  getMeshRuntimeDescriptor,
  getMeshRuntimeCatalog,
  getMeshRuntimeRecords,
} from "@/lib/server/mesh-runtime";

const VALID_ENTITY_CODE = /^[a-z][a-z0-9_]*$/;

export default async function RuntimeListRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  if (!VALID_ENTITY_CODE.test(entityCode)) notFound();

  const [descriptor, catalog] = await Promise.all([
    getMeshRuntimeDescriptor(entityCode),
    getMeshRuntimeCatalog(),
  ]);
  if (!descriptor || !catalog.some((item) => item.entityCode === entityCode && item.list)) notFound();

  return (
    <MeshListPage
      entityCode={entityCode}
      searchParams={await searchParams}
      adapterConfig={{
        fetchDescriptor: async (code) => (
          code === entityCode
            ? toRuntimeDescriptor(descriptor)
            : null
        ),
        fetchRecords: async (code, query) => getMeshRuntimeRecords(code, query),
      }}
    />
  );
}

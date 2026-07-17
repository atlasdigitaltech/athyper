import { notFound } from "next/navigation";
import { AthyperListPage } from "@athyper/app-neon/list";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getRuntimeSavedViews, getRuntimeSavedViewState } from "@/lib/server/runtime-saved-views";
import { getNeonServerSession } from "@/lib/server/session";
import {
  resolveNeonRuntimeLazyListControls,
  resolveNeonRuntimeSearchControls,
} from "@/lib/server/runtime-search-controls";

const VALID_ENTITY_CODE = /^[a-z][a-z0-9_]*$/;

export default async function RuntimeListRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  const resolvedSearchParams = await searchParams;
  const entityCode = entity.trim().replace(/-/g, "_");

  if (!VALID_ENTITY_CODE.test(entityCode)) {
    notFound();
  }

  // Descriptor null-check here keeps 404 semantics for unknown entities.
  // The adapter re-uses this cached result — no second network call.
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    notFound();
  }

  return (
    <AthyperListPage
      entityCode={entityCode}
      searchParams={resolvedSearchParams}
      adapterConfig={{
        fetchDescriptor: async (code) => (
          code === entityCode
            ? descriptor
            : (await getMetaEntityRuntimeDescriptor(code)) ?? null
        ),
        fetchRecords:    getMetaEntityRecordList,
        resolveAccessContext: async () => {
          const session = await getNeonServerSession();
          if (!session) return null;
          const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
          if (!membership?.tenantId) return null;
          const isCompanyCodeCtx = membership.contextType?.toLowerCase() === "company_code";
          return {
            tenantId: membership.tenantId,
            loginLegalEntityId: membership.legalEntityId ?? null,
            loginCompanyCodeIds: isCompanyCodeCtx && membership.organizationId
              ? [membership.organizationId]
              : undefined,
          };
        },
        fetchSavedViews: getRuntimeSavedViews,
        fetchSavedView:  async (viewId, code) => getRuntimeSavedViewState(code ?? entityCode, viewId),
        savedViewsApiHref: () => "/api/relay/platform/saved-views",
        resolveSearchControls: async () => resolveNeonRuntimeSearchControls(),
        resolveLazyListControls: async () => resolveNeonRuntimeLazyListControls(),
      }}
    />
  );
}

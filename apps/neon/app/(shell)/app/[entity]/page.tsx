import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { AthyperListPage, toRuntimeDescriptor } from "@athyper/app-neon/list";
import { MetaEntityListSkeleton } from "@athyper/runtime-list/server";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import {
  getMetaEntityRuntimeDescriptor,
  getMetaEntityRuntimeDescriptorCacheState,
} from "@/lib/server/meta-entity-runtime";
import { getRuntimeSavedViews, getRuntimeSavedViewState } from "@/lib/server/runtime-saved-views";
import { getNeonServerSession } from "@/lib/server/session";
import {
  logRuntimeListDiagnosticSnapshot,
  RuntimeListDiagnosticCollector,
  runtimeDescriptorCacheState,
} from "@/lib/server/runtime-list-observability";
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
  const routeStartedAt = performance.now();
  const { entity } = await params;
  const resolvedSearchParams = await searchParams;
  const entityCode = entity.trim().replace(/-/g, "_");
  const diagnostics = new RuntimeListDiagnosticCollector({ entityCode, routeKind: "rsc" });
  diagnostics.record("route_params", performance.now() - routeStartedAt, "bypass");
  after(() => {
    logRuntimeListDiagnosticSnapshot(diagnostics.snapshot(performance.now() - routeStartedAt));
  });

  if (!VALID_ENTITY_CODE.test(entityCode)) {
    notFound();
  }

  const sessionStartedAt = performance.now();
  const session = await getNeonServerSession();
  diagnostics.record("session", performance.now() - sessionStartedAt, "bypass");

  // Descriptor null-check here keeps 404 semantics for unknown entities.
  // The adapter re-uses this cached result — no second network call.
  const descriptorStartedAt = performance.now();
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  diagnostics.record(
    "descriptor",
    performance.now() - descriptorStartedAt,
    descriptor
      ? runtimeDescriptorCacheState(getMetaEntityRuntimeDescriptorCacheState(descriptor))
      : "bypass",
  );
  if (!descriptor) {
    notFound();
  }

  const listPage = (
    <AthyperListPage
      entityCode={entityCode}
      searchParams={resolvedSearchParams}
      adapterConfig={{
        fetchDescriptor: async (code) => (
          code === entityCode
            ? descriptor
            : (await getMetaEntityRuntimeDescriptor(code)) ?? null
        ),
        fetchRecords: async (code, params, meta, _accessScope, options) =>
          getMetaEntityRecordList(code, params, meta, diagnostics, {
            ...(session ? { session } : {}),
            visibleFieldNames: options?.visibleFieldNames,
            scopeStrategy: "verified_upstream",
          }),
        resolveAccessContext: async () => diagnostics.measure("access_context", "bypass", async () => {
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
        }, { parent: "presenter_build" }),
        fetchSavedViews: (code) => getRuntimeSavedViews(code, diagnostics),
        fetchSavedView:  async (viewId, code) =>
          getRuntimeSavedViewState(code ?? entityCode, viewId, diagnostics),
        savedViewsApiHref: () => "/api/relay/platform/saved-views",
        resolveSearchControls: async () => resolveNeonRuntimeSearchControls(diagnostics),
        resolveLazyListControls: async () => resolveNeonRuntimeLazyListControls(diagnostics),
      }}
      afterResolve={() => (
        <span
          hidden
          data-athyper-runtime-list-diagnostics={JSON.stringify(
            diagnostics.snapshot(performance.now() - routeStartedAt, undefined, "rsc_resolve"),
          )}
        />
      )}
      onResolved={(durationMs) => diagnostics.record(
        "presenter_build",
        durationMs,
        "bypass",
        { attributes: { phase: "resolve" } },
      )}
    />
  );

  return (
    <Suspense fallback={<MetaEntityListSkeleton descriptor={toRuntimeDescriptor(descriptor)} />}>
      {listPage}
    </Suspense>
  );
}

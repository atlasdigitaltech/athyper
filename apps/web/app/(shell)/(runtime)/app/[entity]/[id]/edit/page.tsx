"use client";

/**
 * Runtime entity edit — /app/[entity]/[id]/edit
 *
 * Unified edit page. EntityForm loads initialData from entity detail query,
 * then POSTs an update. On success, redirects to /app/[entity]/[id].
 *
 * Gated by EntityCapabilities.hasEdit — ledger/log/aggregate entities are
 * read-only and cannot be edited.
 *
 * [id] = canonical business key (NOT UUID).
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { EntityForm } from "@athyper/entity-runtime/form";
import { useEntityDetail, useUpdateEntity } from "@athyper/query";
import { Skeleton } from "@athyper/ui/primitives";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";

export default function AppEntityEditRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = use(params);
  const router = useRouter();
  const { data: record, isLoading } = useEntityDetail(entity, id);
  const updateMutation = useUpdateEntity(entity, id);

  // Guard — all hooks above; safe to return early from here
  const { guardLoading, denied } = useSubrouteGuard(entity, "hasEdit");
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entity} entityId={id} />;

  if (isLoading || !record) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <EntityForm
      entityCode={entity}
      initialData={record.data}
      onSubmit={async (data) => {
        await updateMutation.mutateAsync(data);
        router.push(`/app/${entity}/${id}`);
      }}
      onCancel={() => router.back()}
      submitting={updateMutation.isPending}
    />
  );
}

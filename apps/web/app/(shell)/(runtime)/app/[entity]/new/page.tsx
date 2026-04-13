"use client";

/**
 * Runtime entity create — /app/[entity]/new
 *
 * Unified create page for master and document entities.
 * EntityForm reads entity metadata to render the correct fields.
 * On success, redirects to /app/[entity]/[id] using the created record's business key.
 *
 * Examples:
 *   /app/vendor/new           → Create Vendor
 *   /app/purchase-invoice/new → Create Purchase Invoice
 *   /app/journal-entry/new    → Create Journal Entry
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { EntityForm } from "@athyper/entity-runtime/form";
import { useCreateEntity } from "@athyper/query";

export default function AppEntityNewRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const router = useRouter();
  const createMutation = useCreateEntity(entity);

  return (
    <EntityForm
      entityCode={entity}
      onSubmit={async (data) => {
        const created = await createMutation.mutateAsync(data);
        const id = (created as Record<string, unknown>).id as string | undefined;
        router.push(id ? `/app/${entity}/${id}` : `/app/${entity}`);
      }}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}

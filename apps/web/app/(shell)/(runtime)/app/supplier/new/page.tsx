"use client";

/**
 * /app/supplier/new — Supplier Request Intake Form
 *
 * Route override for the generic /app/[entity]/new. Loads the composite flow
 * bundle (`supplier_intake`) and renders CompositeFlowWizard. Falls back to
 * the standard EntityForm when no composite flow is seeded.
 *
 * Entity naming: supplier (matches master.supplier, never "vendor").
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCreateEntity } from "@athyper/query";
import { EntityForm } from "@athyper/entity-runtime/form";
import { FlowWizardSkeleton } from "@athyper/document-runtime/intake";
import SupplierIntakePage from "./_components/SupplierIntakePage";
import type { CompositeFlowBundle } from "@athyper/document-runtime/composite";

const FLOW_CODE = "supplier_intake";

export default function SupplierNewPage() {
  const router = useRouter();

  // Fetch the composite flow bundle — 404 means fallback to EntityForm
  const {
    data: bundle,
    isLoading,
  } = useQuery({
    queryKey: ["entity-flow", "supplier", FLOW_CODE],
    queryFn: async (): Promise<CompositeFlowBundle | null> => {
      const res = await fetch(
        `/api/relay/api/metadata/entities/supplier/flow?flow_code=${encodeURIComponent(FLOW_CODE)}`,
      );
      if (!res.ok) return null;
      return res.json() as Promise<CompositeFlowBundle>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Fallback create mutation — used only when no composite flow is found
  const createMutation = useCreateEntity("supplier");

  if (isLoading) return <FlowWizardSkeleton />;

  // Composite mode — bundle seeded and has composite sections
  if (bundle && bundle.config?.persistence_mode === "composite_supplier_intake") {
    return (
      <SupplierIntakePage
        bundle={bundle}
        onCancel={() => router.push("/app/supplier")}
      />
    );
  }

  // Fallback — no composite flow seeded; render the standard flat EntityForm
  async function handleFallbackSubmit(data: Record<string, unknown>) {
    const created = await createMutation.mutateAsync(data);
    const id = (created as Record<string, unknown>).id as string | undefined;
    router.push(id ? `/app/supplier/${id}` : "/app/supplier");
  }

  return (
    <EntityForm
      entityCode="supplier"
      onSubmit={handleFallbackSubmit}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}

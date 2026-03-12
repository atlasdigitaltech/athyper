"use client";

import { use } from "react";

import { EntityControlsEditor } from "@/components/mesh/schemas/controls/EntityControlsEditor";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";

export default function ControlsPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const { fields, loading, refresh } = useEntityFields(entity);

  return (
    <div className="space-y-6">
      <EntityControlsEditor
        fields={fields ?? []}
        loading={loading}
        refresh={refresh}
      />
    </div>
  );
}

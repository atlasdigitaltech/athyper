"use client";

import { useParams } from "next/navigation";

import type { ReactNode } from "react";

import { EntityDetailHeader } from "@/components/mesh/schemas/EntityDetailHeader";
import { EntityTabNav } from "@/components/mesh/schemas/EntityTabNav";
import { useEntityMeta } from "@/lib/schema-manager/use-entity-meta";

export default function EntityDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { wb, entity } = useParams<{ wb: string; entity: string }>();
  const entityName = decodeURIComponent(entity);
  const { entity: entityData, loading } = useEntityMeta(entityName);

  const backHref = `/wb/${wb}/mesh/meta-studio`;
  const basePath = `/wb/${wb}/mesh/meta-studio/${entity}`;

  return (
    <div className="space-y-4">
      <EntityDetailHeader
        entity={entityData}
        loading={loading}
        backHref={backHref}
      />
      <EntityTabNav basePath={basePath} />
      <div className="pt-2">{children}</div>
    </div>
  );
}

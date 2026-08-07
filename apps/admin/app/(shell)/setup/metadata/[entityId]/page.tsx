import { notFound } from "next/navigation";
import { PageFrame } from "@athyper/platform-surface-kit";
import { Badge } from "@athyper/platform-ui";
import { getAdminServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, RUNTIME_API_URL } from "@/lib/server/runtime-headers";
import { MetaEntityContractWorkspace } from "./_components/MetaEntityContractWorkspace";
import type { EntityDetail } from "./_components/types";

const CLASS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  MASTER: "default",
  DOCUMENT: "secondary",
  CONTROL: "outline",
  REFERENCE: "outline",
};

async function fetchEntityDetail(id: string): Promise<EntityDetail | null> {
  const session = await getAdminServerSession();
  if (!session) return null;

  const res = await fetch(`${RUNTIME_API_URL}/api/metadata/admin/entities/${id}`, {
    headers: buildRuntimeHeaders(session),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load entity: ${res.status}`);
  return res.json() as Promise<EntityDetail>;
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const entity = await fetchEntityDetail(entityId);
  if (!entity) notFound();

  return (
    <PageFrame
      eyebrow={`Meta Studio / ${entity.module_id}`}
      title={entity.label_singular ?? entity.name}
      description={entity.entity_code ?? entity.name}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={CLASS_VARIANT[entity.entity_class] ?? "outline"}>
            {entity.entity_class}
          </Badge>
          <Badge variant={entity.status === "ACTIVE" ? "default" : "outline"}>
            {entity.status}
          </Badge>
        </div>
      }
    >
      <MetaEntityContractWorkspace entity={entity} />
    </PageFrame>
  );
}

import { notFound } from "next/navigation";
import { PageFrame } from "@athyper/surface-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger, Badge } from "@athyper/ui";
import { getAdminServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, RUNTIME_API_URL } from "@/lib/server/runtime-headers";
import { ContractEditor } from "./_components/ContractEditor";
import { FieldBrowser } from "./_components/FieldBrowser";
import { OperationsTab } from "./_components/OperationsTab";
import { LifecycleTab } from "./_components/LifecycleTab";
import { WorkflowTab } from "./_components/WorkflowTab";
import { PolicyTab } from "./_components/PolicyTab";
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
      <Tabs defaultValue="contracts">
        <TabsList className="mb-4">
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="fields">Fields ({entity.fields.length})</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts">
          <ContractEditor entity={entity} />
        </TabsContent>

        <TabsContent value="fields">
          <FieldBrowser fields={entity.fields} />
        </TabsContent>

        <TabsContent value="operations">
          <OperationsTab entityName={entity.name} />
        </TabsContent>

        <TabsContent value="lifecycle">
          <LifecycleTab entityName={entity.name} />
        </TabsContent>

        <TabsContent value="workflow">
          <WorkflowTab entity={entity} />
        </TabsContent>

        <TabsContent value="policy">
          <PolicyTab entityId={entity.id} entityName={entity.name} />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}

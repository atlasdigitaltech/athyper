import { MeshExchangeDetailPage } from "@athyper/app-mesh/console";
import { isMeshVisibleEntity } from "@athyper/app-mesh-route-manifest";
import { notFound } from "next/navigation";
import { PLANE_KEY } from "@/lib/plane";

export default async function RuntimeDetailRoute({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  if (!isMeshVisibleEntity(entity)) notFound();
  return <MeshExchangeDetailPage plane={PLANE_KEY} entity={entity} id={id} />;
}

import { MeshExchangeListPage } from "@athyper/app-mesh/console";
import { isMeshVisibleEntity } from "@athyper/app-mesh-route-manifest";
import { notFound } from "next/navigation";
import { PLANE_KEY } from "@/lib/plane";

export default async function RuntimeListRoute({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isMeshVisibleEntity(entity)) notFound();
  return <MeshExchangeListPage plane={PLANE_KEY} entity={entity} />;
}

import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { supplyChainWorkspaceModel } from "@/components/workspace/workspace-models";

interface SupplyChainWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SupplyChainWorkspacePage({
  searchParams,
}: SupplyChainWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    supplyChainWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={supplyChainWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { assetManagementWorkspaceModel } from "@/components/workspace/workspace-models";

interface AssetManagementWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AssetManagementWorkspacePage({
  searchParams,
}: AssetManagementWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    assetManagementWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={assetManagementWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

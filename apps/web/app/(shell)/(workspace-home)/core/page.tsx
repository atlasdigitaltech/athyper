import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { coreWorkspaceModel } from "@/components/workspace/workspace-models";

interface CoreWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CoreWorkspacePage({
  searchParams,
}: CoreWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    coreWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={coreWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

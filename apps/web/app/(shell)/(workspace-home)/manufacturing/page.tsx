import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { manufacturingWorkspaceModel } from "@/components/workspace/workspace-models";

interface ManufacturingWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ManufacturingWorkspacePage({
  searchParams,
}: ManufacturingWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    manufacturingWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={manufacturingWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { customerExperienceWorkspaceModel } from "@/components/workspace/workspace-models";

interface CustomerExperienceWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerExperienceWorkspacePage({
  searchParams,
}: CustomerExperienceWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    customerExperienceWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={customerExperienceWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

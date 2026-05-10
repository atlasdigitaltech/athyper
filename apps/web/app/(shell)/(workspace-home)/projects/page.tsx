import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { projectsWorkspaceModel } from "@/components/workspace/workspace-models";

interface ProjectsWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectsWorkspacePage({
  searchParams,
}: ProjectsWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    projectsWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={projectsWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

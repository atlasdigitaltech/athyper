import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { peopleWorkspaceModel } from "@/components/workspace/workspace-models";

interface PeopleWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PeopleWorkspacePage({
  searchParams,
}: PeopleWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    peopleWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={peopleWorkspaceModel}
      activeModuleCode={activeModuleCode}
    />
  );
}

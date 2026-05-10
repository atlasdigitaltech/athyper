import {
  WorkspaceDashboard,
  resolveWorkspaceModuleCode,
} from "@/components/workspace/WorkspaceDashboard";
import { financeWorkspaceModel } from "@/components/workspace/workspace-models";
import { FinanceKpiCards } from "./_components/FinanceKpiCards";

interface FinanceWorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FinanceWorkspacePage({
  searchParams,
}: FinanceWorkspacePageProps) {
  const params = await searchParams;
  const activeModuleCode = resolveWorkspaceModuleCode(
    financeWorkspaceModel,
    params["module"],
  );

  return (
    <WorkspaceDashboard
      model={financeWorkspaceModel}
      activeModuleCode={activeModuleCode}
      metricSlot={<FinanceKpiCards />}
    />
  );
}

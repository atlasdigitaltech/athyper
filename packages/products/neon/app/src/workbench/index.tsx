import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { PageFrame, StatePanel } from "@athyper/surface-kit";

export function ContentPage({ plane }: { plane: PlaneKey }) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame eyebrow={config.appName} title="Content">
      <StatePanel title="Content" message="Shared files and references will appear here." />
    </PageFrame>
  );
}

export function GovernancePage({ plane, path }: { plane: PlaneKey; path?: readonly string[] }) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame
      eyebrow={config.appName}
      title="Governance"
      description={path?.length ? path.join(" / ") : undefined}
    >
      <StatePanel title="Governance" message="Governance activity will appear here." />
    </PageFrame>
  );
}

export function WorkbenchPage({ plane, path }: { plane: PlaneKey; path?: readonly string[] }) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame
      eyebrow={config.appName}
      title="Workbench"
      description={path?.length ? path.join(" / ") : undefined}
    >
      <StatePanel title="Workbench" message="Operational workspaces will appear here." />
    </PageFrame>
  );
}

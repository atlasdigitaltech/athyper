import { getPlaneConfig, type PlaneKey } from "@athyper/platform-iam-session-plane";
import { StatePanel, ToolbarButton } from "@athyper/platform-surface-kit";

export function PlaneNotFound({ plane }: { plane: PlaneKey }) {
  const config = getPlaneConfig(plane);
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <StatePanel
        title="Page not found"
        message={`This ${config.appName} route is not registered for the ${config.productSubtitle.toLowerCase()}.`}
        action={<ToolbarButton href={config.defaultPath}>Dashboard</ToolbarButton>}
      />
    </div>
  );
}

import { StatePanel, ToolbarButton } from "@athyper/surface-kit";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <StatePanel title="Page not found" message="This Admin route is not registered for the internal control plane." action={<ToolbarButton href="/dashboard">Dashboard</ToolbarButton>} />
    </div>
  );
}

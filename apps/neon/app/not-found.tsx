import { StatePanel, ToolbarButton } from "@athyper/surface-kit";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <StatePanel title="Page not found" message="This Neon route is not registered for the tenant control plane." action={<ToolbarButton href="/dashboard">Dashboard</ToolbarButton>} />
    </div>
  );
}

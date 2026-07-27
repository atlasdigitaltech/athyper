import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { PageFrame, PanelGrid, StatePanel, WorkPanel } from "@athyper/surface-kit";

export interface PlanePageProps {
  plane: PlaneKey;
}

export interface PathPageProps extends PlanePageProps {
  /** Remaining route segments after the command surface root. */
  path?: readonly string[];
}

export function InboxPage({ plane }: PlanePageProps) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame eyebrow={config.appName} title="Inbox" description="Work requests, approvals, and delegated tasks for this control plane.">
      <PanelGrid>
        <WorkPanel title="Assigned" description="Items owned by the signed-in principal." />
        <WorkPanel title="Delegated" description="Items visible through tenant, partner, or support grants." />
        <WorkPanel title="Escalated" description="Items that require step-up, review, or explicit approval." />
      </PanelGrid>
    </PageFrame>
  );
}

export function NotificationsPage({ plane }: PlanePageProps) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame eyebrow={config.appName} title="Notifications" description="Control-plane notifications with isolated delivery preferences." />
  );
}

export function SavedViewsPage({ plane }: PlanePageProps) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame eyebrow={config.appName} title="Saved views" description="Personal and role-scoped views for this app session boundary." />
  );
}

export function SettingsPage({ plane, path }: PathPageProps) {
  const config = getPlaneConfig(plane);
  return (
    <PageFrame
      eyebrow={config.appName}
      title="Settings"
      description={settingsDescription(path)}
    />
  );
}

function settingsDescription(path: readonly string[] | undefined): string {
  return path?.length
    ? `Section: ${path.join(" / ")}`
    : "Profile, security, notifications, and plane preferences.";
}

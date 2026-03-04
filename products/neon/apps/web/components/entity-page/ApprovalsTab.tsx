"use client";

// components/entity-page/ApprovalsTab.tsx
//
// Approvals tab plugin — displays the approval status, pending tasks
// assigned to the current user, and approval actions. All data comes
// from the descriptor's approval property.

import { Badge, Card } from "@neon/ui";

import type { TabPluginProps } from "@/lib/entity-page/plugin-registry";

const statusVariantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "secondary",
  completed: "default",
  rejected: "destructive",
  canceled: "outline",
};

export function ApprovalsTab({ dynamicDescriptor }: TabPluginProps) {
  const { approval, actions } = dynamicDescriptor;

  // Filter approval actions
  const approvalActions = actions.filter((a) => a.code.startsWith("approval."));

  if (!approval) {
    return (
      <div className="py-4 text-sm text-muted-foreground">
        No approval instance exists for this record.
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Approval Status */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Approval Status</h3>
        <div className="flex items-center gap-3">
          <Badge variant={statusVariantMap[approval.status] ?? "outline"}>
            {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Instance: {approval.instanceId}
          </span>
        </div>
      </Card>

      {/* My Tasks */}
      {approval.myTasks.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">My Approval Tasks</h3>
          <div className="space-y-2">
            {approval.myTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm">Task {task.id.slice(0, 8)}</span>
                <Badge variant={task.status === "pending" ? "secondary" : "outline"}>
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Available Approval Actions */}
      {approvalActions.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Available Actions</h3>
          <div className="space-y-2">
            {approvalActions.map((action) => (
              <div
                key={action.code}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="text-sm font-medium">{action.label}</span>
                <Badge variant={action.enabled ? "secondary" : "outline"}>
                  {action.enabled ? "Available" : "Blocked"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

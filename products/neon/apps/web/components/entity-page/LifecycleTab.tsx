"use client";

// components/entity-page/LifecycleTab.tsx
//
// Lifecycle tab plugin — displays current lifecycle state, available
// transitions, and lifecycle history. Data is derived entirely from
// the descriptor; no direct backend calls are needed.

import { Badge, Card } from "@neon/ui";

import type { TabPluginProps } from "@/lib/entity-page/plugin-registry";

export function LifecycleTab({ dynamicDescriptor }: TabPluginProps) {
  const { currentState, actions } = dynamicDescriptor;

  // Filter lifecycle actions from the full action list
  const lifecycleActions = actions.filter((a) => a.code.startsWith("lifecycle."));

  return (
    <div className="space-y-6 py-4">
      {/* Current State */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Current State</h3>
        {currentState ? (
          <div className="flex items-center gap-3">
            <Badge variant={currentState.isTerminal ? "outline" : "default"}>
              {currentState.stateName}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Code: {currentState.stateCode}
            </span>
            {currentState.isTerminal && (
              <span className="text-xs text-muted-foreground italic">
                (Terminal — no further transitions)
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No lifecycle configured for this entity.
          </p>
        )}
      </Card>

      {/* Available Transitions */}
      {lifecycleActions.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Available Transitions</h3>
          <div className="space-y-2">
            {lifecycleActions.map((action) => (
              <div
                key={action.code}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.label}</span>
                  {!action.enabled && action.disabledReason && (
                    <span className="text-xs text-muted-foreground">
                      ({action.disabledReason})
                    </span>
                  )}
                </div>
                <Badge variant={action.enabled ? "secondary" : "outline"}>
                  {action.enabled ? "Available" : "Blocked"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* No lifecycle info at all */}
      {!currentState && lifecycleActions.length === 0 && (
        <div className="text-sm text-muted-foreground">
          This entity type does not have a lifecycle configured.
        </div>
      )}
    </div>
  );
}

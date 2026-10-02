"use client";
import * as React from "react";
import { ShellSurfaceBoundary } from "./shell-surface-boundary";
import { ShellQuickAccess } from "./quick-access";
import { AtlasWorkspace, type AtlasWorkspaceProps } from "./atlas-workspace";

/** No extra DOM wrapper: preserve existing overlay positioning and workspace lifetime. */
export function ShellOverlayHost({
  quickAccess,
  atlas,
}: {
  readonly quickAccess?: React.ComponentProps<typeof ShellQuickAccess>;
  readonly atlas?: AtlasWorkspaceProps;
}) {
  const [fullTarget, setFullTarget] = React.useState<HTMLDivElement | null>(null);
  return (
    <>
      {quickAccess ? (
        <ShellSurfaceBoundary
          key={JSON.stringify([quickAccess.plane, quickAccess.tenantId, quickAccess.accountScope])}
          label="Quick access recovery"
          onClose={quickAccess.onClose}
        >
          <ShellQuickAccess {...quickAccess} />
        </ShellSurfaceBoundary>
      ) : null}
      {/* Full view target: the shared panel moves Atlas here without remounting.
          The docked panel's backdrop, geometry and pin belong to that frame. */}
      {atlas ? <div ref={setFullTarget} className="athyper-atlas-full-host" /> : null}
      {atlas ? (
        <ShellSurfaceBoundary
          label="Atlas recovery"
          onClose={atlas.onClose ?? (() => {})}
        >
          <AtlasWorkspace {...atlas} fullTarget={fullTarget} />
        </ShellSurfaceBoundary>
      ) : null}
    </>
  );
}

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
      {atlas && !atlas.pinned && atlas.mode !== "fullscreen" ? (
        <button
          type="button"
          className="athyper-atlas-workspace__scrim"
          aria-label="Close Atlas"
          onClick={atlas.onClose}
        />
      ) : null}
      {atlas ? (
        <ShellSurfaceBoundary
          label="Atlas recovery"
          onClose={atlas.onClose ?? (() => {})}
        >
          <AtlasWorkspace {...atlas} />
        </ShellSurfaceBoundary>
      ) : null}
    </>
  );
}

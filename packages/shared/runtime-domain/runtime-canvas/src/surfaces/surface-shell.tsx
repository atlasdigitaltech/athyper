"use client";

import { Component, Suspense, useMemo, type ReactNode } from "react";
import type { MetaEntityRuntimeDescriptor, MetaEntitySurface, ProcessRuntimeState } from "@athyper/runtime-contracts";
import { flattenRuntimeRecord, type RuntimeListState, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { RuntimeEditState } from "../edit/runtime-edit-form";
import { useActiveTab } from "../record/runtime-record-workspace";
import { getSurfaceRenderer } from "./registry";
import type { RuntimeCanvasFlags } from "./types";

export type SurfaceErrorContext = {
  surfaceKind: string;
  entityCode: string;
  recordId: string;
};

interface DescriptorSurfaceShellProps {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
  detailState?: RuntimeListState;
  flags: RuntimeCanvasFlags;
  onSurfaceError?: (error: Error, context: SurfaceErrorContext) => void;
}

const CONTEXT_PANEL_KINDS = new Set([
  "attachments",
  "comments",
  "activity_log",
  "audit_trail",
  "versions",
  "compare",
]);

export function DescriptorSurfaceShell({
  contract,
  record,
  recordId,
  processState,
  detailState,
  flags,
  onSurfaceError,
}: DescriptorSurfaceShellProps) {
  const mainSurfaces = useMemo(() => {
    return contract.surfaces
      .filter((s) => s.enabled && !CONTEXT_PANEL_KINDS.has(s.kind))
      .filter((s) => s.placement === "main")
      .filter((s) => !flags.disabledSurfaceKinds?.includes(s.kind))
      .sort((a, b) => a.order - b.order);
  }, [contract.surfaces, flags.disabledSurfaceKinds]);

  const defaultSurface = mainSurfaces.find((s) => s.kind === "fields") ?? mainSurfaces[0];
  // Chrome (RuntimeEntityHeader) owns tab state via `RuntimeRecordWorkspace`.
  // We consume the active key through `ActiveTabContext` so there is exactly
  // one navigation source per record page — no second in-shell tab strip.
  const activeTabFromChrome = useActiveTab();
  const activeSurface =
    mainSurfaces.find((s) => s.key === activeTabFromChrome) ?? defaultSurface;

  const recordData = useMemo(() => flattenRuntimeRecord(record), [record]);

  if (mainSurfaces.length === 0) {
    return (
      <RuntimeEditState>
        <p className="text-sm text-muted-foreground">No detail surfaces are configured for this entity.</p>
      </RuntimeEditState>
    );
  }

  return (
    <div id="surfaces" className="flex flex-col gap-2.5">
      {activeSurface ? (
        <SurfaceErrorBoundary
          key={`${activeSurface.key}:${recordId}`}
          surfaceKind={activeSurface.kind}
          entityCode={contract.entityCode}
          recordId={recordId}
          onError={onSurfaceError}
        >
          <Suspense fallback={<SurfaceLoadingFallback />}>
            <SurfaceBody
              contract={contract}
              surface={activeSurface}
              record={recordData}
              recordId={recordId}
              processState={processState}
              detailState={detailState}
              flags={flags}
            />
          </Suspense>
        </SurfaceErrorBoundary>
      ) : null}
    </div>
  );
}

function SurfaceBody({
  contract,
  surface,
  record,
  recordId,
  processState,
  detailState,
  flags,
}: {
  contract: MetaEntityRuntimeDescriptor;
  surface: MetaEntitySurface;
  record: Record<string, unknown>;
  recordId: string;
  processState?: ProcessRuntimeState;
  detailState?: RuntimeListState;
  flags?: RuntimeCanvasFlags;
}) {
  const Renderer = getSurfaceRenderer(surface.kind);

  if (!Renderer) {
    return (
      <RuntimeEditState>
        <p className="text-sm font-medium text-muted-foreground">
          No renderer for surface kind{" "}
          <code className="text-foreground">"{surface.kind}"</code>.
        </p>
      </RuntimeEditState>
    );
  }

  return (
    <div
      role="tabpanel"
      id={`surface-panel-${surface.key}`}
      aria-label={surface.label}
    >
      <Renderer
        contract={contract}
        surface={surface}
        record={record}
        recordId={recordId}
        processState={processState}
        detailState={detailState}
        flags={flags}
      />
    </div>
  );
}

function SurfaceLoadingFallback() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border bg-background p-6">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

interface SurfaceErrorBoundaryProps {
  surfaceKind: string;
  entityCode: string;
  recordId: string;
  children: ReactNode;
  onError?: (error: Error, context: SurfaceErrorContext) => void;
}

interface SurfaceErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class SurfaceErrorBoundary extends Component<SurfaceErrorBoundaryProps, SurfaceErrorBoundaryState> {
  constructor(props: SurfaceErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): SurfaceErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: message };
  }

  override componentDidCatch(error: unknown) {
    const context: SurfaceErrorContext = {
      surfaceKind: this.props.surfaceKind,
      entityCode: this.props.entityCode,
      recordId: this.props.recordId,
    };
    console.error(
      `[RuntimeCanvas] Surface error — kind: ${context.surfaceKind}, entity: ${context.entityCode}, record: ${context.recordId}`,
      error,
    );
    if (error instanceof Error && this.props.onError) {
      this.props.onError(error, context);
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          This section encountered an error. Try refreshing the page.
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <a
          href="/workbench/document-rendering"
          className="rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:border-primary/50 hover:bg-muted/30"
        >
          <div className="font-medium">Document rendering</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Templates, immutable versions, brands, letterheads, bindings, and print profiles.
          </div>
        </a>
      </div>
    </PageFrame>
  );
}

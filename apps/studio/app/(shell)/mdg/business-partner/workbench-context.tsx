"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { LayoutIcon } from "@athyper/platform-icons";
import { CompositionPreview } from "./composition-preview";
import { IntakeSurfacePreview } from "../../entity/graphs/intake-surface-preview";
import { BusinessPartnerWorkbench } from "@athyper/product-studio-business-partner";
export function WorkbenchContext({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter(),
    params = useSearchParams();
  return (
    <BusinessPartnerWorkbench
      renderContextHeader={(controls, status) => (
        <PageFrame width="full">
          <PageHeader
            level="collection"
            icon={<LayoutIcon />}
            title="Business Partner configuration"
            actions={controls}
            description={status}
          />
        </PageFrame>
      )}
      renderCompositionPreview={(graph, revision, surfaceId) => (
        <CompositionPreview
          graph={graph}
          revision={revision}
          surfaceId={surfaceId}
        />
      )}
      compositionMode={["/model", "/validation", "/workflows"].some((tab) =>
        pathname.endsWith(tab),
      )}
      selection={params.get("inspect") ?? ""}
      selectedObject={params.get("object") ?? undefined}
      onObjectSelect={(node) => {
        const next = new URLSearchParams(params.toString());
        next.set("object", node);
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
      renderPreview={(graph, revision) => (
        <IntakeSurfacePreview
          text={JSON.stringify(graph)}
          revision={revision}
        />
      )}
      onSelect={(selection) => {
        const next = new URLSearchParams(params.toString());
        next.delete("object");
        if (selection) next.set("inspect", selection);
        else next.delete("inspect");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
          scroll: false,
        });
      }}
    >
      {children}
    </BusinessPartnerWorkbench>
  );
}

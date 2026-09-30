"use client";
import { readCollaborationFull } from "./record/record-url-state";
import { writeRecordLocation } from "./record/write-record-location";
import { useEffect, useState, type ReactNode, type ComponentProps } from "react";
import { EntityRuntimeWorkspace } from "./entity-runtime-workspace";
import { EntityCollaborationSurface } from "./collaboration-surface";
import { isCollaborationRequested } from "./collaboration-route";

type RuntimeContext = Pick<ComponentProps<typeof EntityRuntimeWorkspace>, "entityCode" | "surfaceKey" | "contextKey" | "resourceContext" | "locale" | "collaborationSectionKeys">;
export type EntityEditCollaborationProps = RuntimeContext & { recordId?: string | null; children: ReactNode };
const defaultSections = ["comments", "attachments"];

/** A sibling of the governed form: collaboration never submits or remounts its fields. */
export function EntityEditCollaboration({
  recordId,
  children,
  ...runtime
}: EntityEditCollaborationProps) {
  return recordId ? (
    <ExistingRecordCollaboration {...runtime} recordId={recordId}>
      {children}
    </ExistingRecordCollaboration>
  ) : (
    <>{children}</>
  );
}
function read() {
  const q =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  return {
    open: isCollaborationRequested(q.toString()),
    full: readCollaborationFull(),
    section: q.get("collaborationSection") ?? "comments",
  };
}
function ExistingRecordCollaboration({
  recordId,
  children,
  collaborationSectionKeys = defaultSections,
  ...runtime
}: RuntimeContext & { recordId: string; children: ReactNode }) {
  const [state, setState] = useState(read),
    [pinned, setPinned] = useState(true);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const change = (next: typeof state) => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", next.open ? "collaboration" : "closed");
    url.searchParams.set("collaborationSection", next.section);
    if (next.full) url.searchParams.set("collaborationMode", "content");
    else url.searchParams.set("collaborationMode", "side");
    writeRecordLocation(url, "push");
    setState(next);
  };
  return (
    <div
      className="a-entity-edit-collaboration"
      data-full={(state.open && state.full) || undefined}
    >
      <p>Comments and files save separately from record changes.</p>
      <EntityRuntimeWorkspace
        {...runtime}
        recordId={recordId}
        collaborationSectionKeys={collaborationSectionKeys}
        renderHeader={(_values, _revision, _actions, navigation) => (
          <nav className="a-entity-record__tabs" aria-label="Record collaboration">
            {navigation.collaboration?.sections.map((section) => (
              <button
                key={section.key}
                type="button"
                aria-current={
                  state.open && state.full && state.section === section.key
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  change({ ...state, full: state.open ? state.full : true, open: true, section: section.key });
                  window.dispatchEvent(
                    new CustomEvent("athyper:collaboration-open"),
                  );
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>
        )}
        renderBody={({ navigation }) =>
          navigation.collaboration ? (
            <EntityCollaborationSurface
              open={state.open}
              fullView={state.full}
              onFullViewChange={(full) =>
                change({ ...state, open: true, full })
              }
              pinned={pinned}
              onPinnedChange={setPinned}
              activeSectionKey={state.section}
              sections={navigation.collaboration.sections}
              onOpenChange={(open) =>
                change({ ...state, open, full: open && state.full })
              }
              onActiveSectionChange={(section) => change({ ...state, section })}
              preloadSection={navigation.collaboration.preloadSection}
              renderSection={navigation.collaboration.renderSection}
            />
          ) : null
        }
      />
      <div
        className="a-entity-edit-collaboration__fields"
        hidden={state.open && state.full}
      >
        {children}
      </div>
    </div>
  );
}

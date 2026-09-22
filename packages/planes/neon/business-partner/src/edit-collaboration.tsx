"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  EntityRuntimeWorkspace,
  EntityCollaborationSurface,
} from "@athyper/platform-entity-form-detail";

/** A sibling of the governed form: collaboration never submits or remounts its fields. */
export function BusinessPartnerEditCollaboration({
  recordId,
  children,
}: {
  recordId?: string | null;
  children: ReactNode;
}) {
  return recordId ? (
    <ExistingRecordCollaboration recordId={recordId}>
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
    open: q.get("panel") === "collaboration",
    full: q.get("collaborationMode") === "content",
    section: q.get("collaborationSection") ?? "comments",
  };
}
function ExistingRecordCollaboration({
  recordId,
  children,
}: {
  recordId: string;
  children: ReactNode;
}) {
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
    else url.searchParams.delete("collaborationMode");
    window.history.pushState(window.history.state, "", url);
    setState(next);
  };
  return (
    <div
      className="bp-edit-collaboration"
      data-full={(state.open && state.full) || undefined}
    >
      <p>Comments and files save separately from record changes.</p>
      <EntityRuntimeWorkspace
        entityCode="business_partner"
        recordId={recordId}
        surfaceKey="detail"
        collaborationSectionKeys={["comments", "attachments"]}
        renderHeader={(_values, _revision, _actions, navigation) => (
          <nav className="a-record-360__tabs" aria-label="Record collaboration">
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
                  change({ ...state, open: true, section: section.key });
                  window.dispatchEvent(
                    new CustomEvent("athyper:collaboration-open"),
                  );
                }}
              >
                {section.key === "attachments" ? "Files" : "Comments"}
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
        className="bp-edit-collaboration__fields"
        hidden={state.open && state.full}
      >
        {children}
      </div>
    </div>
  );
}

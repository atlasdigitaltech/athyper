"use client";
import { writeRecordLocation } from "./write-record-location";
import { useState, useEffect } from "react";
import {
  readCollaborationFull,
  readCollaborationOpen,
  readCollaborationSection,
} from "./record-url-state";
export function useRecordCollaboration() {
  const [collaborationFull, setCollaborationFull] = useState(
    readCollaborationFull,
  );
  const [collaborationOpen, setCollaborationOpen] = useState(
    readCollaborationOpen,
  );
  const [collaborationSection, setCollaborationSection] = useState(
    readCollaborationSection,
  );
  // Side view is always docked; the surface restores only its width.
  const [collaborationPinned, setCollaborationPinned] = useState(true);

  useEffect(() => {
    const update = () => {
      setCollaborationFull(readCollaborationFull());
      setCollaborationOpen(readCollaborationOpen());
      setCollaborationSection(readCollaborationSection());
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const changeCollaborationFull = (full: boolean) => {
    const next = new URL(window.location.href);
    next.searchParams.set("panel", "collaboration");
    next.searchParams.set(
      "collaborationSection",
      collaborationSection ?? "comments",
    );
    if (full) next.searchParams.set("collaborationMode", "content");
    else next.searchParams.set("collaborationMode", "side");
    writeRecordLocation(next, "push");
    setCollaborationFull(full);
    setCollaborationOpen(true);
  };
  const setCollaborationPanel = (
    open: boolean,
    sectionKey = collaborationSection,
    updateLocation?: (url: URL) => void,
  ) => {
    const next = new URL(window.location.href);
    if (open) {
      next.searchParams.set("panel", "collaboration");
      if (!collaborationOpen) { next.searchParams.set("collaborationMode", "content"); setCollaborationFull(true); }
      if (sectionKey) next.searchParams.set("collaborationSection", sectionKey);
    } else {
      next.searchParams.set("panel", "closed");
      next.searchParams.delete("collaborationMode");
      setCollaborationFull(false);
      next.searchParams.delete("collaborationSection");
      // File/thread identifiers remain valid record navigation state for the
      // forthcoming rich collaboration actions, but are never loaded on close.
    }
    updateLocation?.(next);
    writeRecordLocation(next, "push");
    setCollaborationOpen(open);
    if (sectionKey) setCollaborationSection(sectionKey);
  };
  const setCollaborationTab = (sectionKey: string) => {
    const next = new URL(window.location.href);
    if (!collaborationOpen) { next.searchParams.set("collaborationMode", "content"); setCollaborationFull(true); }
    next.searchParams.set("collaborationSection", sectionKey);
    next.searchParams.set("panel", "collaboration");
    writeRecordLocation(next, "push");
    setCollaborationSection(sectionKey);
    setCollaborationOpen(true);
    window.dispatchEvent(new CustomEvent("athyper:collaboration-open"));
  };

  return {
    collaborationFull,
    collaborationOpen,
    collaborationSection,
    collaborationPinned,
    setCollaborationPinned,
    setCollaborationFull,
    setCollaborationOpen,
    changeCollaborationFull,
    setCollaborationPanel,
    setCollaborationTab,
  };
}

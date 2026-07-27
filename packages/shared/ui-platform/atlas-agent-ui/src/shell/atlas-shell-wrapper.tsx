"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type {
  AtlasPlaneProfile,
  AtlasSessionScope,
} from "@athyper/atlas-agent-runtime";
import { SurfaceStackProvider } from "@athyper/ui/surfaces/stack";
import { AtlasProvider } from "../provider/atlas-provider";
import type { AtlasThreadHistoryOptions } from "../provider/atlas-provider";
import { useAtlas } from "../provider/atlas-context";
import { AtlasFullscreen } from "../surfaces/atlas-fullscreen";
import { AtlasPanel } from "../surfaces/atlas-panel";

export interface AtlasShortcut {
  key: string;
  ctrlOrMeta?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface AtlasShellWrapperProps {
  enabled: boolean;
  scope: AtlasSessionScope;
  profile: AtlasPlaneProfile;
  mutationFetch: typeof fetch;
  endpoint?: string;
  feedbackEndpoint?: string | null;
  threadHistory?: AtlasThreadHistoryOptions;
  /**
   * No chord is registered by default. Prefer exposing Atlas through the
   * application command launcher; configure this only after collision review.
   */
  shortcut?: AtlasShortcut;
  children: ReactNode;
}

/**
 * Owns the single Atlas surface stack for an application shell. Disabled and
 * plane-mismatched states return children directly, so they cannot fetch the
 * catalog, register shortcuts, or mount hidden Atlas surfaces.
 */
export function AtlasShellWrapper({
  enabled,
  scope,
  profile,
  mutationFetch,
  endpoint,
  feedbackEndpoint,
  threadHistory,
  shortcut,
  children,
}: AtlasShellWrapperProps) {
  if (!enabled || scope.plane !== profile.plane) return children;

  return (
    <SurfaceStackProvider>
      <AtlasProvider
        scope={scope}
        profile={profile}
        mutationFetch={mutationFetch}
        {...(endpoint ? { endpoint } : {})}
        {...(feedbackEndpoint !== undefined ? { feedbackEndpoint } : {})}
        {...(threadHistory ? { threadHistory } : {})}
      >
        <AtlasShortcutListener shortcut={shortcut} />
        {children}
        <AtlasPanel />
        <AtlasFullscreen />
      </AtlasProvider>
    </SurfaceStackProvider>
  );
}

function AtlasShortcutListener({
  shortcut,
}: {
  shortcut: AtlasShortcut | undefined;
}) {
  const atlas = useAtlas();
  const availabilityRef = useRef(atlas.availability);
  const openRef = useRef(atlas.open);
  availabilityRef.current = atlas.availability;
  openRef.current = atlas.open;
  const key = shortcut?.key;
  const ctrlOrMeta = shortcut?.ctrlOrMeta;
  const altKey = shortcut?.altKey;
  const shiftKey = shortcut?.shiftKey;

  useEffect(() => {
    if (!key) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.isComposing
        || availabilityRef.current !== "ready"
        || isEditingTarget(event.target)
      ) {
        return;
      }
      const keyMatches =
        event.key.toLocaleLowerCase() === key.toLocaleLowerCase();
      const commandMatches = ctrlOrMeta
        ? event.ctrlKey || event.metaKey
        : !event.ctrlKey && !event.metaKey;
      if (
        !keyMatches
        || !commandMatches
        || event.altKey !== Boolean(altKey)
        || event.shiftKey !== Boolean(shiftKey)
      ) {
        return;
      }
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [altKey, ctrlOrMeta, key, shiftKey]);

  return null;
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

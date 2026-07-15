"use client";

import type { PlaneKey } from "@athyper/session-plane";

import type { LastContext } from "./types";

function keyForPlane(plane: PlaneKey): string {
  return `${plane}:lastContext`;
}

export function setLastContext(
  plane: PlaneKey,
  org: string,
  workbench: string,
): void {
  try {
    window.localStorage.setItem(keyForPlane(plane), JSON.stringify({ org, workbench }));
  } catch {
    // Storage is an optimization; auth state remains server-owned.
  }
}

export function getLastContext(plane: PlaneKey): LastContext | null {
  try {
    const raw = window.localStorage.getItem(keyForPlane(plane));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { org?: unknown }).org === "string" &&
      typeof (parsed as { workbench?: unknown }).workbench === "string"
    ) {
      return parsed as LastContext;
    }
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return null;
}

export function clearLastContext(plane: PlaneKey): void {
  try {
    window.localStorage.removeItem(keyForPlane(plane));
  } catch {
    // Ignore unavailable storage.
  }
}

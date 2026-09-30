"use client";
import { createContext, useContext } from "react";
import {
  useSessionIdentity,
  useExperienceRevision,
  usePermissions,
} from "@athyper/platform-shell-app-foundation";
import { sessionScopeKey } from "./session-scope-key";

export const ThumbnailRecordScope = createContext("");
export function useThumbnailScope() {
  const identity = useSessionIdentity();
  const revision = useExperienceRevision();
  const permissions = [...usePermissions()].sort();
  const record = useContext(ThumbnailRecordScope);
  return JSON.stringify([
    sessionScopeKey(identity.scope, "", record),
    revision,
    permissions,
  ]);
}

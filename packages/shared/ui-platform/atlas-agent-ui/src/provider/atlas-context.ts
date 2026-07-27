"use client";

import { createContext, useContext } from "react";
import type {
  AtlasConversationState,
  AtlasFeedbackPayload,
  AtlasPlaneProfile,
  AtlasThread,
  ModelCatalog,
} from "@athyper/atlas-agent-runtime";
import type { AtlasContextBinding } from "./atlas-context-binding";

export type AtlasSurfaceMode = "panel" | "fullscreen";
export type AtlasAvailability = "loading" | "ready" | "unavailable";

export interface AtlasRateLimitNotice {
  message: string;
  retryAfterSeconds: number | null;
}

export interface AtlasThreadHistoryContextValue {
  threads: AtlasThread[];
  loading: boolean;
  error: string | null;
  retentionNotice: string;
  mutatingThreadId: string | null;
  activeThreadId: string | null;
  archiveEnabled: boolean;
  deleteEnabled: boolean;
  refresh(): Promise<void>;
  resume(threadId: string): Promise<void>;
  archive(threadId: string): Promise<void>;
  delete(threadId: string): Promise<void>;
}

export interface AtlasContextValue {
  isOpen: boolean;
  state: AtlasConversationState;
  profile: AtlasPlaneProfile;
  availability: AtlasAvailability;
  rateLimitNotice: AtlasRateLimitNotice | null;
  // Provider switcher
  catalog: ModelCatalog | null;
  catalogLoading: boolean;
  catalogError: Error | null;
  currentModelId: string | null;
  setModelId(id: string): void;
  refetchCatalog(): Promise<void>;
  feedbackEnabled: boolean;
  submitFeedback(
    messageId: string,
    runId: string,
    verdict: AtlasFeedbackPayload["verdict"],
  ): Promise<void>;
  // Surface mode (panel vs fullscreen)
  surfaceMode: AtlasSurfaceMode;
  setSurfaceMode(mode: AtlasSurfaceMode): void;
  // Actions
  open(): void;
  openWithQuery(query: string): void;
  close(): void;
  send(query: string): Promise<void>;
  cancel(): void;
  newConversation(): void;
  /** Internal tokenized identifier-only registration used by the public hook. */
  registerContextBinding?(binding: AtlasContextBinding): () => void;
  /**
   * Null unless both the plane capability and explicit provider option enable
   * server-authoritative persistence.
   */
  threadHistory: AtlasThreadHistoryContextValue | null;
}

export const AtlasContext = createContext<AtlasContextValue | null>(null);

export function useAtlas(): AtlasContextValue {
  const context = useContext(AtlasContext);
  if (!context) throw new Error("useAtlas must be used inside AtlasProvider");
  return context;
}

export function useOptionalAtlas(): AtlasContextValue | null {
  return useContext(AtlasContext);
}

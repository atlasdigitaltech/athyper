"use client";

// lib/finance/use-release-commands.ts
//
// Command hooks for Release Orchestration (207-208).
// Each hook wraps a POST command to /api/fin/releases.

import { useState, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finPost } from "./fetcher";

import type {
  ReleaseCommandResult,
  AssembleReleaseInput,
  SupersedeReleaseInput,
} from "./release-types";

// ---------------------------------------------------------------------------
// useReleaseCommands — unified command dispatcher
// ---------------------------------------------------------------------------

export interface UseReleaseCommandsResult {
  executing: boolean;
  error: string | null;
  lastResult: ReleaseCommandResult | null;
  assemble: (input: AssembleReleaseInput) => Promise<ReleaseCommandResult | null>;
  markReady: (releaseId: string) => Promise<ReleaseCommandResult | null>;
  release: (releaseId: string) => Promise<ReleaseCommandResult | null>;
  cancel: (releaseId: string, reason?: string) => Promise<ReleaseCommandResult | null>;
  supersede: (input: SupersedeReleaseInput) => Promise<ReleaseCommandResult | null>;
  exceptionSignoff: (releaseId: string, notes: string) => Promise<ReleaseCommandResult | null>;
  verifyIntegrity: (releaseId: string) => Promise<ReleaseCommandResult | null>;
}

export function useReleaseCommands(): UseReleaseCommandsResult {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReleaseCommandResult | null>(null);

  // Track active nonces to prevent duplicate submissions from rapid clicks
  const activeNonceRef = useRef<string | null>(null);

  const exec = useCallback(async (body: Record<string, unknown>): Promise<ReleaseCommandResult | null> => {
    // Generate a unique nonce for this command invocation
    const nonce = crypto.randomUUID();

    // Prevent duplicate submission — if a command is already in flight, reject
    if (activeNonceRef.current) {
      return null;
    }
    activeNonceRef.current = nonce;

    setExecuting(true);
    setError(null);

    try {
      const result = await finPost<ReleaseCommandResult>("/api/fin/releases", { ...body, nonce });
      setLastResult(result);
      return result;
    } catch (err) {
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Command failed";
      setError(message);
      return null;
    } finally {
      activeNonceRef.current = null;
      setExecuting(false);
    }
  }, []);

  const assemble = useCallback(
    (input: AssembleReleaseInput) => exec({ command: "assemble", ...input }),
    [exec],
  );

  const markReady = useCallback(
    (releaseId: string) => exec({ command: "mark-ready", releaseId }),
    [exec],
  );

  const release = useCallback(
    (releaseId: string) => exec({ command: "release", releaseId }),
    [exec],
  );

  const cancel = useCallback(
    (releaseId: string, reason?: string) => exec({ command: "cancel", releaseId, reason }),
    [exec],
  );

  const supersede = useCallback(
    (input: SupersedeReleaseInput) => exec({ command: "supersede", ...input }),
    [exec],
  );

  const exceptionSignoff = useCallback(
    (releaseId: string, notes: string) => exec({ command: "exception-signoff", releaseId, notes }),
    [exec],
  );

  const verifyIntegrity = useCallback(
    (releaseId: string) => exec({ command: "verify-integrity", releaseId }),
    [exec],
  );

  return {
    executing, error, lastResult,
    assemble, markReady, release, cancel, supersede, exceptionSignoff, verifyIntegrity,
  };
}

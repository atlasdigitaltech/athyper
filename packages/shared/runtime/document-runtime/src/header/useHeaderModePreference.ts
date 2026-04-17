/**
 * @athyper/document-runtime — useHeaderModePreference
 *
 * Persists the user's chosen header display mode per document type in
 * localStorage under the key `ath:doc-header-mode:{docType}`.
 *
 * SSR note: the lazy initializer reads localStorage synchronously.
 * When `typeof window === "undefined"` (server render) it returns the
 * defaultMode so that the server-rendered HTML is consistent. Any
 * difference from the stored client value will be reconciled on the
 * first client paint — acceptable for a purely presentational preference.
 */
"use client";

import { useState } from "react";
import type { HeaderMode } from "./types";

const PREFIX = "ath:doc-header-mode:";
const VALID_MODES: readonly HeaderMode[] = ["expanded", "collapsed", "pinned"];

function readStored(key: string, fallback: HeaderMode): HeaderMode {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return (VALID_MODES as string[]).includes(raw ?? "") ? (raw as HeaderMode) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Returns `[mode, setMode]` backed by localStorage.
 *
 * @param docType  Stable key for this document type, e.g. `"invoice"`, `"purchase_order"`.
 *                 Lowercased before use so callers don't have to normalise.
 * @param defaultMode  Mode to use when no preference has been stored yet. Defaults to `"expanded"`.
 */
export function useHeaderModePreference(
  docType: string,
  defaultMode: HeaderMode = "expanded",
): [HeaderMode, (mode: HeaderMode) => void] {
  const key = `${PREFIX}${docType.toLowerCase()}`;

  const [mode, setModeState] = useState<HeaderMode>(() =>
    readStored(key, defaultMode),
  );

  const setMode = (m: HeaderMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(key, m);
    } catch {
      // Ignore — private browsing, storage quota exceeded, etc.
    }
  };

  return [mode, setMode];
}

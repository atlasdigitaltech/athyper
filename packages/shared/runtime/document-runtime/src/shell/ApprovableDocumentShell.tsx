/**
 * @athyper/document-runtime — Approvable Document Shell
 *
 * Full page wrapper for approvable documents.
 * Layout order (same as DocumentShell):
 *   1. Process Chain Ribbon (optional)
 *   2. ApprovableDocumentHeader  ← replaces DocumentHeader
 *   3. Exception Stack (optional)
 *   4. Tab content / children
 *
 * Adds `persistMode` prop: when true the header's display mode is
 * automatically read from / written to localStorage per document type
 * via useHeaderModePreference.
 */
"use client";

import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import {
  type ProcessChain,
  type DocumentException,
  type ProcessHealthTile,
  type ValidationNotice,
} from "@athyper/api-contracts/documents";
import { ProcessChainRibbon } from "../chain";
import { ExceptionStack } from "../exceptions";
import { ProcessHealthStrip } from "../health";
import { ValidationBanner } from "../validation";
import {
  ApprovableDocumentHeader,
  type ApprovableDocumentHeaderTab,
} from "../header/ApprovableDocumentHeader";
import { useHeaderModePreference } from "../header/useHeaderModePreference";
import type { ApprovableDocumentHeaderDTO, HeaderMode } from "../header/types";

export interface ApprovableDocumentShellProps {
  // ── Header data ────────────────────────────────────────────────
  data: ApprovableDocumentHeaderDTO;

  /**
   * When true the shell manages mode persistence automatically via
   * useHeaderModePreference, keyed on `data.identity.typeLabel`.
   * The `initialMode` prop becomes the fallback for first-time visitors.
   */
  persistMode?: boolean;

  /** Initial display mode (ignored when persistMode=true and a stored
   *  preference exists). Defaults to "expanded". */
  initialMode?: HeaderMode;

  onModeChange?: (mode: HeaderMode) => void;
  onAction?: (action: string) => void;

  // ── Tabs ───────────────────────────────────────────────────────
  tabs: ApprovableDocumentHeaderTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;

  // ── Optional chrome ────────────────────────────────────────────
  chain?: ProcessChain | null;
  exceptions?: DocumentException[];

  // ── Orchestrator slots (v1.2 spec) ────────────────────────────
  healthTiles?: ProcessHealthTile[];
  onHealthTileClick?: (tile: ProcessHealthTile) => void;
  validationNotices?: ValidationNotice[];
  onValidationAction?: (hint: string) => void;

  children: ReactNode;
  className?: string;
}

export function ApprovableDocumentShell({
  data,
  persistMode = false,
  initialMode = "expanded",
  onModeChange,
  onAction,
  tabs,
  activeTab,
  onTabChange,
  chain,
  exceptions,
  healthTiles,
  onHealthTileClick,
  validationNotices,
  onValidationAction,
  children,
  className,
}: ApprovableDocumentShellProps) {
  // Always call the hook (rules of hooks). When persistMode=false we still
  // call it but discard the stored value, so the localStorage key is
  // `ath:doc-header-mode:__noop__` — harmless.
  const docTypeKey = persistMode
    ? data.identity.typeLabel.toLowerCase()
    : "__noop__";

  const [storedMode, setStoredMode] = useHeaderModePreference(
    docTypeKey,
    initialMode,
  );

  const effectiveInitialMode = persistMode ? storedMode : initialMode;

  const handleModeChange = (m: HeaderMode) => {
    if (persistMode) setStoredMode(m);
    onModeChange?.(m);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 1. Process Chain Ribbon */}
      {chain && chain.nodes.length > 0 && <ProcessChainRibbon chain={chain} />}

      {/* 2. Approvable Document Header (with tabs embedded) */}
      <ApprovableDocumentHeader
        data={data}
        initialMode={effectiveInitialMode}
        onModeChange={handleModeChange}
        onAction={onAction}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />

      {/* 3. Process Health Strip */}
      {healthTiles && healthTiles.length > 0 && (
        <ProcessHealthStrip
          tiles={healthTiles}
          onTileClick={onHealthTileClick}
        />
      )}

      {/* 4. Validation Banner */}
      {validationNotices && validationNotices.length > 0 && (
        <ValidationBanner
          notices={validationNotices}
          onActionHint={onValidationAction}
        />
      )}

      {/* 5. Exception Stack */}
      {exceptions && exceptions.length > 0 && (
        <ExceptionStack exceptions={exceptions} />
      )}

      {/* 6. Tab content */}
      {children}
    </div>
  );
}

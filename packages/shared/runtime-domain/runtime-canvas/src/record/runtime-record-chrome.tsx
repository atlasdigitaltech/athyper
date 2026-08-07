"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { useEntityEdit } from "@athyper/runtime-shared";
import type { UseOperationDispatchReturn } from "../actions";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import type { ReactNode } from "react";
import { RuntimeEntityHeader } from "../header";
import type { HeaderMode } from "../header/types";
import { headerPrimaryActionClass, headerSecondaryActionClass } from "../header/header-chrome";
import { useRuntimeEditFormActionState } from "../edit/runtime-edit-form-actions";
import { PRINT_ACTION_ID, type RuntimeRecordChromeModel } from "./runtime-header-model";
import type { RuntimeCanvasFlags } from "../surfaces/types";
import { useRecordWorkspaceSnapshotIntentPrefetch } from "../record-query";

interface RuntimeRecordChromeProps {
  chrome: RuntimeRecordChromeModel;
  editMode?: boolean;
  activePlatformIcon?: string;
  onPlatformIconClick?: (id: string) => void;
  onPrint?: () => void;
  activeTab?: string;
  onActiveTabChange?: (id: string) => void;
  flags?: RuntimeCanvasFlags;
  adaptedOps?: EntityOperation[];
  operationDispatch?: UseOperationDispatchReturn;
  /**
   * Controlled header mode. Pass-through to RuntimeEntityHeader. When set,
   * the chrome reflects this mode on every render — used by object-page
   * consumers that drive expanded → pinned via scroll position.
   */
  mode?: HeaderMode;
  /** Pass-through extension slot below the identity bar. */
  extensionSlot?: ReactNode;
  /**
   * Overrides the identity bar's leading action slot. When provided, this
   * node renders in place of the built-in classic-form save/discard strip.
   * Document object-page consumers pass `<DocumentChromeActionBar />` here
   * so the View|Edit pill + save status + Discard/Save live in one place.
   */
  actionLeadingSlot?: ReactNode;
  /**
   * Suppresses the identity bar's built-in "EDITING" badge. Set true when
   * a custom `actionLeadingSlot` carries its own mode indicator (e.g. the
   * View|Edit pill) so the same signal isn't shown twice.
   */
  hideEditingBadge?: boolean;
}

export function RuntimeRecordChrome({
  chrome,
  editMode = false,
  activePlatformIcon,
  onPlatformIconClick,
  onPrint,
  activeTab,
  onActiveTabChange,
  flags,
  adaptedOps,
  operationDispatch,
  mode,
  extensionSlot,
  actionLeadingSlot,
  hideEditingBadge = false,
}: RuntimeRecordChromeProps) {
  const firstTab = chrome.header.tabs?.[0]?.id;
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(firstTab);
  const editFormActions = useRuntimeEditFormActionState();
  const { guardNavigate } = useEntityEdit();
  const typeHref = chrome.header.identity.typeHref;
  const activeTabValue = activeTab ?? uncontrolledActiveTab;
  const prefetchSnapshotIndex = useRecordWorkspaceSnapshotIntentPrefetch();

  useEffect(() => {
    if (!activeTab && firstTab && !chrome.header.tabs?.some((tab) => tab.id === uncontrolledActiveTab)) {
      setUncontrolledActiveTab(firstTab);
    }
  }, [activeTab, chrome.header.tabs, firstTab, uncontrolledActiveTab]);

  function navigate(href: string) {
    if (href.startsWith("#")) {
      const target = document.getElementById(href.slice(1));
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    window.location.assign(href);
  }

  function guardedNavigate(href: string) {
    guardNavigate(() => navigate(href));
  }

  function handleAction(actionId: string) {
    if (actionId === PRINT_ACTION_ID || actionId === "print") {
      onPrint?.();
      return;
    }

    if (flags?.operationDispatch && actionId.startsWith("operation:")) {
      if (operationDispatch && adaptedOps) {
        const opKey = actionId.slice("operation:".length);
        const op = adaptedOps.find((o) => o.id === opKey || o.permission_code === opKey);
        if (op && (op.handler_type === "API" || op.handler_type === "MODAL")) {
          void operationDispatch.dispatch(op.permission_code, adaptedOps);
        }
      }
      return;
    }

    const href = chrome.actionHrefs[actionId];
    if (href) guardedNavigate(href);
  }

  function handleTabChange(tabId: string) {
    const href = chrome.tabHrefs[tabId];
    if (href) {
      guardNavigate(() => {
        setActiveTab(tabId);
        navigate(href);
      });
      return;
    }
    setActiveTab(tabId);
  }

  function handleTabIntent(tabId: string) {
    if (tabId === "versions") prefetchSnapshotIndex();
  }

  function setActiveTab(tabId: string) {
    if (!activeTab) setUncontrolledActiveTab(tabId);
    onActiveTabChange?.(tabId);
  }

  function handlePlatformIconClick(panelId: string) {
    if (panelId === "print") {
      onPrint?.();
      return;
    }
    if (onPlatformIconClick) {
      onPlatformIconClick(panelId);
      return;
    }
    const href = chrome.platformIconHrefs[panelId];
    if (href) guardedNavigate(href);
  }

  const sharedHeaderProps = {
    model: chrome.header,
    editMode,
    hideEditingBadge,
    mode,
    extensionSlot,
    onBack: () => guardNavigate(() => window.history.back()),
    onTypeClick: typeHref ? () => guardedNavigate(typeHref) : undefined,
    onAction: handleAction,
    activeTab: activeTabValue,
    onTabChange: handleTabChange,
    onTabIntent: handleTabIntent,
    platformIcons: chrome.platformIcons,
    onPlatformIconClick: handlePlatformIconClick,
    activePlatformIcon,
    actionLeadingSlot: actionLeadingSlot
      ?? (editMode && editFormActions.formId ? (
        <RuntimeEditHeaderActions state={editFormActions} />
      ) : undefined),
  };

  return <RuntimeEntityHeader {...sharedHeaderProps} />;
}

function RuntimeEditHeaderActions({ state }: { state: ReturnType<typeof useRuntimeEditFormActionState> }) {
  const saveLabel = state.saving
    ? (state.mode === "create" ? "Creating" : "Saving")
    : (state.mode === "create" ? "Create" : "Save");

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {state.message ? (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "hidden max-w-48 truncate text-xs font-medium lg:inline",
            state.status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {state.status === "saved" ? (
            <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          ) : null}
          {state.message}
        </span>
      ) : null}
      {state.dirty ? (
        <button
          type="reset"
          form={state.formId ?? undefined}
          disabled={state.saving}
          className={cn(headerSecondaryActionClass, "gap-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Discard
        </button>
      ) : null}
      <button
        type="submit"
        form={state.formId ?? undefined}
        disabled={!state.dirty || state.saving}
        className={cn(
          headerPrimaryActionClass,
          "whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saveLabel}
      </button>
    </div>
  );
}

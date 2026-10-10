"use client";

import React from "react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

/**
 * Compact required-context status strip (business-context-selector-design.md §10.4).
 * Plane-agnostic: replaces the large "Choose a work context" body card. The plane's
 * own scope control (rendered separately in the nav band via `contextControl`/
 * `renderScopeControl`) is the only selector — this strip contains no second one.
 */
export function RequiredContextStatus({
  message,
  scopeControlAvailable,
}: {
  readonly message?: string;
  readonly scopeControlAvailable: boolean;
}) {
  const intl = useEntityI18n();
  return (
    <p className="a-entity-list__required-context-status" role="status">
      <span>
        {message ?? intl.message("list.chrome.requiredContext")}
      </span>
      {!scopeControlAvailable ? (
        <span role="alert">{intl.message("list.chrome.contextUnavailable")}</span>
      ) : null}
    </p>
  );
}

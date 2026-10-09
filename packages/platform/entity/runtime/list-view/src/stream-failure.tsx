"use client";
import React from "react";
import type { ApiTransportError } from "@athyper/platform-api-client";
import { classifyAppError } from "@athyper/platform-shell-app-foundation/error-taxonomy";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import {
  localizeEntityErrorModel,
  localizedEntityError,
} from "@athyper/platform-i18n/entity-errors";
import { Button } from "@athyper/platform-ui";

type EntityIntl = ReturnType<typeof useEntityI18n>;

/** A failed secondary request (a Board lane, a Calendar or Gantt stream),
 * stated with its reason so no record is hidden silently (Calendar blueprint
 * principle 6). The reason is the same safe, localized category the list's
 * own error state shows, never server detail; retry is offered only when the
 * failure is retryable. */
export function StreamFailure({
  message,
  error,
  onRetry,
  intl,
  className = "a-entity-dated__notice",
}: {
  readonly message: string;
  readonly error?: ApiTransportError;
  readonly onRetry: () => void;
  readonly intl: EntityIntl;
  readonly className?: string;
}) {
  const model = error
    ? localizeEntityErrorModel(classifyAppError({ error }), intl)
    : undefined;
  return (
    <div className={className} role="status">
      <span>
        {message}
        {error && model
          ? ` ${localizedEntityError(error, intl, model.description)}`
          : null}
        {model?.requestId ? (
          <small>
            {" "}
            {intl.message("entity.requestId", { id: model.requestId })}
          </small>
        ) : null}
      </span>
      {!model || model.canRetry ? (
        <Button variant="secondary" size="small" onClick={onRetry}>
          {intl.message("list.retry")}
        </Button>
      ) : null}
    </div>
  );
}

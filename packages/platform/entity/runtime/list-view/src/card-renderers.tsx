import React, { type ReactNode } from "react";
import type { JsonValue, ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";

/** Presentation context a card supplies to its value renderers. */
export interface CardValueContext {
  /** The card sits in a terminal lane, where due dates are no longer urgent. */
  readonly terminal?: boolean;
}

/** Registered card renderers, selected by a qualified display component's
 * runtime key. A field without a registered key renders as plain text. */
export function renderCardValue(
  value: JsonValue | undefined,
  field: ListFieldDescriptorV1,
  display: ReactNode,
  intl: ReturnType<typeof useEntityI18n> | undefined,
  context: CardValueContext | undefined,
  today: string = localDate(new Date()),
): ReactNode | undefined {
  if (field.rendererKey === "number.progress") {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(number)) return undefined;
    const percent = Math.max(0, Math.min(100, Math.round(number)));
    return (
      <span className="a-entity-list__progress">
        <span className="a-entity-list__progress-track" aria-hidden="true">
          <span style={{ inlineSize: `${percent}%` }} />
        </span>
        <span>{intl ? intl.number(percent / 100, { style: "percent" }) : `${percent}%`}</span>
      </span>
    );
  }
  if (field.rendererKey === "date.due") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
    const overdue = !context?.terminal && value.slice(0, 10) < today;
    return overdue ? (
      <span className="a-entity-list__due a-entity-list__due--overdue">
        {display}
        <span className="a-visually-hidden">{intl?.message("list.board.overdue") ?? "Overdue"}</span>
      </span>
    ) : (
      <span className="a-entity-list__due">{display}</span>
    );
  }
  return undefined;
}

function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

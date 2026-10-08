import type { MessageValues } from "@athyper/platform-i18n";

/** A transient list status announced to the user. Keyed by catalogue message,
 * never compared as display text, so wording and locale can change safely. */
export interface ListNotice {
  readonly key: string;
  readonly values?: MessageValues;
}

/** Notices that stay visible instead of being announced only to assistive tech. */
const VISIBLE_NOTICE_KEYS: ReadonlySet<string> = new Set([
  "list.notice.viewUnavailableSystem",
  "list.notice.layoutUnavailable",
  "list.notice.savedViewRetired",
  "list.board.laneFieldUnavailable",
]);

export function isVisibleListNotice(notice: ListNotice | undefined): boolean {
  return notice !== undefined && VISIBLE_NOTICE_KEYS.has(notice.key);
}

export function listNotice(key: string, values?: MessageValues): ListNotice {
  return values ? { key, values } : { key };
}

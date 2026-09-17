import type {
  ShellActivityDataSource,
  ShellActivityTab,
} from "./activity-center";

/** A missing, failed or partial count is not evidence of an empty inbox. */
export function activityCount(
  source: ShellActivityDataSource | undefined,
  tab: ShellActivityTab,
): number | undefined {
  if (!source || source.loading || source.error) return undefined;
  const explicit =
    tab === "notifications"
      ? source.unreadNotificationCount
      : source.openInboxCount;
  if (explicit !== undefined)
    return Number.isSafeInteger(explicit) && explicit >= 0
      ? explicit
      : undefined;
  if (tab === "notifications")
    return source.notifications && !source.hasMoreNotifications
      ? source.notifications.filter((item) => item.unread).length
      : undefined;
  return source.inbox && !source.hasMoreInbox ? source.inbox.length : undefined;
}

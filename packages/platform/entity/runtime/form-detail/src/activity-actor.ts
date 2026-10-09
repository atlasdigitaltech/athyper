import type { IntlRuntime } from "@athyper/platform-i18n";

/** Who acted or captured, on the activity surfaces (event list, versions,
 * saved snapshots). The server records the acting principal's identifier,
 * which is never displayed (AGENTS.md: no UUIDs). Until the principal's
 * display name is resolved server-side (a pending decision, Compare blueprint
 * section 9.6), a recorded principal reads "Name not available"; no principal
 * means the system acted. */
export function activityActorLabel(actor: string | null | undefined, intl: Pick<IntlRuntime, "message">): string {
  return intl.message(actor ? "activity.actorNameUnavailable" : "activity.system");
}

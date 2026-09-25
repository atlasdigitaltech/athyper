import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { InAppNotification } from "@athyper/server-contract-notifications";
import type { WorkItem } from "@athyper/server-contract-workflow";
import {
  activityCommentHref,
  createActivityDestinationResolver,
  type ActivityCoordinate,
  type ActivityDestination,
} from "@athyper/server-platform-notifications";

export function createActivityPresentation(
  read: (
    context: VerifiedRequestContext,
    coordinate: ActivityCoordinate,
  ) => Promise<ActivityDestination | undefined>,
) {
  return {
    async notifications(
      context: VerifiedRequestContext,
      items: readonly InAppNotification[],
    ) {
      const resolve = createActivityDestinationResolver((coordinate) =>
        read(context, coordinate),
      );
      return Promise.all(
        items.map(async (item) => {
          const p = item.payload;
          const entityCode =
            text(p.parent_entity_code) ??
            text(p.entity_type) ??
            item.entityType;
          const recordId =
            text(p.parent_record_id) ?? text(p.entity_id) ?? item.entityId;
          const commentId =
            text(p.comment_id) ??
            (item.eventCode.startsWith("collaboration.comment.")
              ? text(p.resource_id)
              : undefined);
          const destination =
            entityCode && recordId
              ? await resolve({ entityCode, recordId, commentId })
              : undefined;
          const { href: _old, ...base } = item;
          if (!destination)
            return entityCode && recordId
              ? {
                  ...base,
                  title: "Record update unavailable",
                  body: "The related record or comment is no longer available, or your access has changed.",
                  actionLabel: undefined,
                  recordLabel: undefined,
                }
              : { ...base, actionLabel: undefined };
          // Only replace generated supplier copy; never rewrite a user's comment text.
          const supplier = item.eventCode.startsWith("supplier.");
          let href = destination.href;
          if (supplier && typeof p.caseUrl === "string") {
            try {
              const old = new URL(p.caseUrl),
                next = new URL(href, "https://activity.invalid");
              if (old.pathname === next.pathname) {
                for (const key of ["attemptId", "workItemId"]) {
                  const value = old.searchParams.get(key);
                  if (value && /^[0-9a-f-]{36}$/i.test(value))
                    next.searchParams.set(key, value);
                }
                next.hash = "review";
                href = next.pathname + next.search + next.hash;
              }
            } catch {}
          }
          return {
            ...base,
            entityType: entityCode,
            href: commentId ? activityCommentHref(href, commentId) : href,
            recordLabel: destination.recordLabel,
            actionLabel: commentId
              ? "View comment"
              : (destination.actionLabel ?? "View record"),
            ...(item.eventCode.startsWith("workflow.") ? {
              title: readableWorkText(item.title),
              body: item.body ? readableWorkText(item.body) : undefined,
            } : {}),
            ...(supplier
              ? {
                  title:
                    item.title.split(" — ")[0] ?? "Supplier request update",
                  body:
                    item.body
                      ?.split("Open the authenticated request:")[0]
                      ?.trim() ||
                    "Open the request to view the latest update and any action needed.",
                }
              : {}),
          };
        }),
      );
    },
    async inbox(context: VerifiedRequestContext, items: readonly WorkItem[]) {
      const resolve = createActivityDestinationResolver((coordinate) =>
        read(context, coordinate),
      );
      return Promise.all(
        items.map(async (item) => {
          const destination = await resolve({
            entityCode: item.sourceEntityCode,
            recordId: item.sourceEntityId,
          });
          const { href: _old, ...base } = item;
          if (!destination) return { ...base, title: "Related work unavailable", description: "The related record is no longer available, or your access has changed.", recordLabel: undefined, actionLabel: undefined };
          const url = new URL(destination.href, "https://activity.invalid");
          const attempt = text(item.payload.attemptId);
          if (attempt) {
            url.searchParams.set("attemptId", attempt);
            url.searchParams.set("workItemId", item.id);
            url.hash = "review";
          }
          return {
            ...base,
            href: url.pathname + url.search + url.hash,
            recordLabel: destination.recordLabel,
            assignmentLabel: context.principalId && (item.assigneePrincipalId===context.principalId||item.claimantPrincipalId===context.principalId)?"Assigned to you":item.assigneeTeamId?"Assigned to your team":"Available to you",
            actionLabel: destination.actionLabel ?? "Open task",
            title: item.title.startsWith("INDEPENDENT_APPROVAL:")
              ? "Review supplier request"
              : item.title.startsWith("Data stewardship:")
                ? "Review request information"
                : item.title.startsWith("Dependency impact review:") ? "Review dependency impact" : item.title,
            ...(item.description?.startsWith("Dependency impact review:") ? {description:"Review how this request affects related records."} : {}),
          };
        }),
      );
    },
  };
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readableWorkText(value:string):string {
 return value.replace(/(?:Dependency impact review|Data stewardship): [0-9a-f]{8}-[0-9a-f-]{27,}/gi,match=>match.startsWith("Dependency")?"Review dependency impact":"Review request information").replace(/INDEPENDENT_APPROVAL: Review level \d+/g,"Review supplier request");
}

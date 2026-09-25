import { describe, it, expect, vi } from "vitest";
import { createActivityPresentation } from "../activity-presentation.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { InAppNotification } from "@athyper/server-contract-notifications";
import type { WorkItem } from "@athyper/server-contract-workflow";
const context = {} as VerifiedRequestContext;
const notification = {
  id: "n",
  eventCode: "collaboration.comment.mentioned",
  entityType: "document.comment",
  entityId: "c",
  title: "Mention",
  body: "hello",
  payload: { entity_type: "neutral_entity", entity_id: "r", comment_id: "c" },
} as unknown as InAppNotification;
describe("activity destination presentation", () => {
  it("uses generic authorized record coordinates and opens the exact comment", async () => {
    const read = vi.fn(async () => ({
      href: "/records/r",
      recordLabel: "Neutral record",
    }));
    const [item] = await createActivityPresentation(read).notifications(
      context,
      [notification],
    );
    expect(read).toHaveBeenCalledWith(context, {
      entityCode: "neutral_entity",
      recordId: "r",
      commentId: "c",
    });
    expect(item?.href).toBe(
      "/records/r?panel=collaboration&collaborationSection=comments&commentId=c#comment-c",
    );
    expect(item?.actionLabel).toBe("View comment");
  });
  it("does not expose stale content or an untrusted destination when access is unavailable", async () => {
    const [item] = await createActivityPresentation(
      async () => undefined,
    ).notifications(context, [{ ...notification, recordLabel:"Stale secret", href: "https://evil.test" }]);
    expect(item?.href).toBeUndefined();
    expect(item?.body).not.toBe("hello");
    expect(item?.recordLabel).toBeUndefined();
  });
  it("caches repeated coordinates and preserves review context without exposing completion", async () => {
    const read = vi.fn(async () => ({
      href: "/requests/r",
      recordLabel: "Request A",
      actionLabel: "Review request",
    }));
    const task = {
      id: "w",
      sourceEntityCode: "request",
      sourceEntityId: "r",
      title: "INDEPENDENT_APPROVAL: Review level 1",
      payload: { attemptId: "attempt" },
    } as unknown as WorkItem;
    const items = await createActivityPresentation(read).inbox(context, [
      task,
      { ...task, id: "w2" },
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(items[0]?.href).toBe(
      "/requests/r?attemptId=attempt&workItemId=w#review",
    );
    expect(items[0]?.actionLabel).toBe("Review request");
  });
  it("ignores a legacy URL for a different record", async () => {
    const [item] = await createActivityPresentation(async () => ({
      href: "/requests/right",
      recordLabel: "Right",
    })).notifications(context, [
      {
        ...notification,
        eventCode: "supplier.review",
        payload: { caseUrl: "https://evil.test/requests/wrong" },
        entityType: "request",
        entityId: "right",
      },
    ]);
    expect(item?.href).toBe("/requests/right");
    expect(item?.body).not.toContain("https://");
  });
});

it("replaces technical workflow UUID titles without changing user comment text",async()=>{
 const presenter=createActivityPresentation(async()=>({href:"/records/r",recordLabel:"Supplier A"}));
 const title="New work assigned: Dependency impact review: e83daf1d-637b-43ad-984c-13101b96ae4a";
 const [workflow,comment]=await presenter.notifications(context,[{...notification,title,eventCode:"workflow.task.assigned"},{...notification,title}]);
 expect(workflow?.title).toBe("New work assigned: Review dependency impact");expect(comment?.title).toBe(title);
});

it.each(["neon","mesh","studio"] as const)("resolves neutral records in the authenticated %s plane without a Neon fallback",async plane=>{
 const scoped={tenantId:"tenant",principalId:"reader",planeKey:plane} as VerifiedRequestContext;
 const read=vi.fn(async(c:VerifiedRequestContext,coordinate:{recordId:string})=>c===scoped&&coordinate.recordId==="r"?{href:`/app/entity/neutral/${plane}/r`,recordLabel:`${plane} neutral record`}:undefined);
 const presenter=createActivityPresentation(read);
 const [item]=await presenter.notifications(scoped,[notification]);
 expect(item?.href).toContain(`/app/entity/neutral/${plane}/r?`);
 const [task]=await presenter.inbox(scoped,[{id:"task",sourceEntityCode:"neutral_entity",sourceEntityId:"r",title:"Review neutral record",payload:{}} as WorkItem]);
 expect(task?.href).toContain(`/app/entity/neutral/${plane}/r`);
 const [unavailable]=await presenter.notifications(scoped,[{...notification,payload:{entity_type:"neutral_entity",entity_id:"missing"}}]);
 expect(unavailable?.href).toBeUndefined();expect(unavailable?.recordLabel).toBeUndefined();
});

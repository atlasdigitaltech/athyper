import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TaskInformation, type TaskInformationExchange } from "./task-information";
const exchange: TaskInformationExchange = { id: "exchange", work_item_id: "item", attempt_id: "attempt", requested_by: "reviewer", respondent_id: "maker", question: "Clarify <script>identity</script>", response: null, state: "open", due_at: "2026-09-16T00:00:00Z" };
const render = (principalId: string, patch: Partial<TaskInformationExchange> = {}, attemptId = "attempt") => renderToStaticMarkup(<TaskInformation exchanges={[{ ...exchange, ...patch }]} principalId={principalId} attemptId={attemptId} requestItemId={principalId === "reviewer" ? "item" : undefined} busy={false} onCommand={async () => undefined} />);
it("allows the requester to answer without exposing reviewer completion", () => {
 const html = render("maker"); expect(html).toContain("Send response"); expect(html).not.toContain("Accept response and resume review"); expect(html).not.toContain("<script>");
});
it("requires reviewer acceptance after an answer and prevents a second pending question", () => {
 const html = render("reviewer", { state: "answered", response: "Clarified" }); expect(html).toContain("Accept response and resume review"); expect(html).not.toContain("Question for the requester"); expect(html).not.toContain("Send response");
});
it("does not offer answer or resume on cancelled or historical exchanges", () => {
 for (const html of [render("maker", { state: "cancelled" }), render("maker", {}, "new-attempt"), render("reviewer", { state: "answered" }, "new-attempt")]) { expect(html).not.toContain("Send response"); expect(html).not.toContain("Accept response and resume review"); }
});
it("offers pending-response escalation only to its requesting reviewer and retains the response owner", () => {
 expect(render("reviewer",{escalationEnabled:true})).toContain("Escalate pending response");
 expect(render("maker",{escalationEnabled:true})).not.toContain("Escalate pending response");
 expect(render("reviewer",{escalationEnabled:true},"next-attempt")).not.toContain("Escalate pending response");
 expect(render("maker",{escalated_at:"2026-09-15T00:00:00Z",escalation_reason:"Follow up required"})).toContain("Send response");
});

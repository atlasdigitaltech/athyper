"use client";
import { useState } from "react";
import { Button, Input } from "@athyper/platform-ui";

export type TaskInformationExchange = {
  id: string; work_item_id: string; attempt_id: string; requested_by: string; respondent_id: string;
  escalationEnabled?: boolean; escalated_at?: string | null; escalation_reason?: string | null;
  question: string; response: string | null; state: string; due_at: string; pause_started_at?: string | null; kind?: "clarification" | "consultation";
};

export function TaskInformation({ exchanges, principalId, attemptId, requestItemId, busy, onCommand }: {
  exchanges: readonly TaskInformationExchange[]; principalId: string; attemptId: string;
  requestItemId?: string; busy: boolean;
  onCommand: (itemId: string, action: "request" | "respond" | "resolve" | "escalate", text?: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  return <section className="bp-journey-panel bp-information-panel" aria-label="Task information requests">
    <h3>Information requests</h3>
    <p>Clarify the submitted information here. To change business data or required documents, return the request for changes. Responses do not count as approval.</p>
    {requestItemId && !exchanges.some(x => x.work_item_id === requestItemId && ["open", "answered"].includes(x.state)) ? <div>
      <label>Question for the requester<Input value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} /></label>
      <Button variant="secondary" disabled={busy || !question.trim()} onClick={() => void onCommand(requestItemId, "request", question)}>Request information</Button>
    </div> : null}
    {exchanges.map(x => <Exchange key={x.id} exchange={x} principalId={principalId} current={x.attempt_id === attemptId} busy={busy} onCommand={onCommand} />)}
  </section>;
}

function Exchange({ exchange: x, principalId, current, busy, onCommand }: {
  exchange: TaskInformationExchange; principalId: string; current: boolean; busy: boolean;
  onCommand: (itemId: string, action: "request" | "respond" | "resolve" | "escalate", text?: string) => Promise<void>;
}) {
  const [response, setResponse] = useState("");
  const [reason,setReason]=useState("");
  return <article>
    <p><strong>{x.question}</strong> · {x.state}{!current ? " · Previous submission" : ""}</p>
    <p>Response due: <time dateTime={x.due_at}>{new Date(x.due_at).toLocaleString()}</time></p>
    {x.pause_started_at ? <p>The decision clock for this item pauses up to the response deadline. The overall case deadline continues.</p> : null}
    {x.kind === "consultation" ? <p>Supervisor advice does not transfer voting authority or pause the decision deadline.</p> : null}
    {x.escalated_at ? <p>Supervisor notified: {x.escalation_reason}</p> : null}
    {current && x.escalationEnabled && principalId === x.requested_by ? <div>
      <label>Reason for supervisor attention<Input value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} /></label>
      <Button disabled={busy || !reason.trim()} onClick={()=>void onCommand(x.work_item_id,"escalate",reason)}>Escalate pending response</Button>
      <p>This notifies the response supervisor. The requester still owns the response; approval remains blocked.</p>
    </div> : null}
    {x.response ? <p>{x.response}</p> : null}
    {current && x.state === "open" && principalId === x.respondent_id ? <div>
      <label>Your clarification<Input value={response} maxLength={4000} onChange={e => setResponse(e.target.value)} /></label>
      <Button disabled={busy || !response.trim()} onClick={() => void onCommand(x.work_item_id, "respond", response)}>Send response</Button>
    </div> : null}
    {current && x.state === "answered" && principalId === x.requested_by ?
      <Button disabled={busy} onClick={() => void onCommand(x.work_item_id, "resolve")}>{x.kind === "consultation" ? "Accept supervisor advice" : "Accept response and resume review"}</Button> : null}
  </article>;
}

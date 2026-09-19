"use client";
/** Edits the same draft body submitted to the owning publication API. */
export function TaskRuleControls({ draft, disabled, onChange }: { draft: string; disabled: boolean; onChange(value: string): void }) {
  let body: any;
  try { body = JSON.parse(draft); } catch { return null; }
  const tasks = body?.processBinding?.tasks;
  if (!Array.isArray(tasks)) return null;
  if (!tasks.every((task: unknown) => task !== null && typeof task === "object" && !Array.isArray(task) && typeof (task as any).profile === "string" && typeof (task as any).code === "string"))
    return <p>Correct the task entries in the draft JSON to use the task controls.</p>;
  const edit = (index: number, patch: object) => {
    body.processBinding.tasks[index] = { ...tasks[index], ...patch };
    onChange(JSON.stringify(body, null, 2));
  };
  return <fieldset disabled={disabled}>
    <legend>Task information, decision authority and supervisor rules</legend>
    <p>These controls update the publication draft below. An independent checker must publish them before new submissions use them.</p>
    {tasks.map((task: any, index: number) => <fieldset key={`${task.profile}:${task.code}`}>
      <legend>{task.profile} · {task.code}</legend>
      <label>Return for changes <input type="checkbox" checked={task.caseAuthority?.returnForChanges ?? true} onChange={e => edit(index, { caseAuthority: { schema: "athyper.task-case-authority/1", rejectProposal: task.caseAuthority?.rejectProposal ?? true, returnForChanges: e.target.checked } })} /></label>
      <label>Reject proposal <input type="checkbox" checked={task.caseAuthority?.rejectProposal ?? true} onChange={e => edit(index, { caseAuthority: { schema: "athyper.task-case-authority/1", returnForChanges: task.caseAuthority?.returnForChanges ?? true, rejectProposal: e.target.checked } })} /></label>
      {task.informationPolicy ? <>
        <label>Information response deadline (hours) <input type="number" min={1} max={168} value={task.informationPolicy.responseHours} onChange={e => edit(index, { informationPolicy: { ...task.informationPolicy, responseHours: Number(e.target.value) } })} /></label>
        <label>Overdue response supervisor role <input value={task.informationPolicy.overdueSupervisorRole??""} onChange={e=>{const informationPolicy={...task.informationPolicy};if(e.target.value)informationPolicy.overdueSupervisorRole=e.target.value;else delete informationPolicy.overdueSupervisorRole;edit(index,{informationPolicy});}} /></label>
        <label>Decision clock during clarification <select value={task.informationPolicy.clockMode} onChange={e => edit(index, { informationPolicy: { ...task.informationPolicy, clockMode: e.target.value } })}>
          <option value="bounded_pause">Pause up to the response deadline</option><option value="elapsed">Continue counting elapsed time</option>
        </select></label>
      </> : null}
      <label>Supervisor action <select value={task.escalationPolicy?.mode ?? "unchanged"} onChange={e => {
        if(e.target.value === "unchanged") { const next = {...task}; delete next.escalationPolicy; body.processBinding.tasks[index]=next; onChange(JSON.stringify(body,null,2)); }
        else edit(index,{escalationPolicy:{schema:"athyper.task-escalation-policy/1",mode:e.target.value,...(e.target.value==="consult"?{responseHours:48}:{}),supervisorRole:task.escalationPolicy?.supervisorRole??""}});
      }}><option value="unchanged">Keep current published configuration</option><option value="notify">Notify supervisor</option><option value="consult">Request supervisor advice</option><option value="reassign">Transfer outstanding assignment</option></select></label>
      {task.escalationPolicy?.mode === "consult" ? <label>Advice response deadline (hours) <input type="number" min={1} max={168} value={task.escalationPolicy.responseHours} onChange={e => edit(index,{escalationPolicy:{...task.escalationPolicy,responseHours:Number(e.target.value)}})} /></label> : null}
      {task.escalationPolicy ? <label>Published supervisor role code <input value={task.escalationPolicy.supervisorRole} onChange={e => edit(index,{escalationPolicy:{...task.escalationPolicy,supervisorRole:e.target.value}})} /></label> : null}
    </fieldset>)}
  </fieldset>;
}

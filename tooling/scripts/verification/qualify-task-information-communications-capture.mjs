/** Match actual P7 delivery ledger entries to Mailpit capture; no sends. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const source=JSON.parse(readFileSync("governance/policy/reports/task-rules-information-browser-live.dev.json","utf8"));
const cases=[{id:source.caseId}];
const ids=cases.map(c=>{assert.match(c.id,/^[0-9a-f-]{36}$/);return "'"+c.id+"'::uuid";}).join(',');
const sql =
  "SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT d.id,d.external_id,d.recipient_id,d.recipient_addr,m.event_code,m.payload->>'caseNo' case_no,m.payload->'communication' pin FROM event.notification_delivery d JOIN event.notification_message m ON m.id=d.message_id WHERE m.event_code LIKE 'supplier.onboarding.notice.%' AND d.channel='email' AND d.status='delivered' AND m.event_code IN ('supplier.onboarding.notice.information_requested','supplier.onboarding.notice.information_answered') AND m.entity_id IN ("+ids+")) x";
const rows = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-At",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(rows.length,2);
const program = `const rows=${JSON.stringify(rows)};const checks=[];for(const row of rows){const result=await fetch('http://mailtrap:8025/api/v1/search?query='+encodeURIComponent(row.case_no));if(!result.ok)throw Error('Mailpit search failed');const {messages}=await result.json();let match;for(const message of messages){const detail=await(await fetch('http://mailtrap:8025/api/v1/message/'+message.ID)).json();let body;try{body=JSON.parse(detail.Text);}catch{continue;}if(body.deliveryId===row.id){if(match)throw Error('Duplicate capture for delivery');match={message,body};}}if(!match)throw Error('Delivery missing from Mailpit');if(match.body.recipientAddress!==row.recipient_addr||match.body.recipientId!==row.recipient_id)throw Error('Capture recipient mismatch');if(match.body.payload.data.communication.attemptId!==row.pin.attemptId)throw Error('Attempt pin mismatch');if(!match.body.payload.data.caseUrl.startsWith('https://neon.dev.athyper.test/mdg/business-partner/requests/'))throw Error('Unsafe link');checks.push({deliveryId:row.id,eventCode:row.event_code,mailpitId:match.message.ID,attemptId:row.pin.attemptId,recipientMatched:true,oneCapture:true,pinnedAuthenticatedLink:true});}console.log(JSON.stringify(checks));`;
const checks = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-source-worker-1",
      "node",
      "--input-type=module",
    ],
    { input: program, encoding: "utf8" },
  ),
);
const report = {
  at: new Date().toISOString(),
  passed: true,
  scope:
    "Real Mailpit captures matched to committed delivery ledger; no signed storage URLs or document content",
  checks,
};
writeFileSync(
  "governance/policy/reports/task-information-communications-capture.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ passed: true, captures: checks.length }));

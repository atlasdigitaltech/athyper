import { execFileSync } from "node:child_process";
import { readFileSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";

const evidencePath=resolve(process.argv[2]??process.env.ACCEPTANCE_EVIDENCE_PATH??"");
if(!evidencePath)throw new Error("Pass the record-transfer evidence JSON path");
const source=JSON.parse(readFileSync(evidencePath,"utf8")),container=process.env.ACCEPTANCE_DB_CONTAINER??"athyper-dev-db-1",prefix=process.env.ACCEPTANCE_DATABASE_PREFIX??"athyper";
const assertions=[];
for(const plane of ["neon","mesh","studio"]){const item=source.evidence?.[plane];if(!item)throw new Error(`Missing ${plane} evidence`);const expected=[
  ["records.import.committed",item.import?.sessionId],
  ["records.import.cancelled",item.cancelledImport?.sessionId],
  ["records.export.completed",item.export?.exportRequestId],
  ["records.export.failed",item.rejectedExport?.exportRequestId],
  ["records.export.restart_requested",item.rejectedExport?.exportRequestId],
  [item.cancelledExport?.status==="cancelled"?"records.export.cancelled":"records.export.completed",item.cancelledExport?.exportRequestId],
  ...(plane==="studio"?[]:[["records.import.failed",item.mutations?.rejected?.sessionId],["records.import.restart_requested",item.mutations?.rejected?.sessionId]]),
];for(const [eventCode,transferId] of expected){if(typeof transferId!=="string")throw new Error(`${plane} evidence is missing ${eventCode} transfer ID`);const query=`SELECT count(*) FROM audit.audit_log WHERE tenant_id='${uuid(source.tenantId)}'::uuid AND event_code='${eventCode}' AND context->>'${eventCode.startsWith("records.export")?"exportRequestId":"sessionId"}'='${uuid(transferId)}'`;const count=Number(execFileSync("docker",["exec",container,"psql","-U","postgres","-d",`${prefix}_${plane}`,"-Atc",query],{encoding:"utf8"}).trim());if(count<1)throw new Error(`${plane} ${eventCode} audit evidence is missing for ${transferId}`);assertions.push({plane,eventCode,transferId,count});}}
const result={schemaVersion:1,evidencePath,assertedAt:new Date().toISOString(),assertions};
const output=process.env.ACCEPTANCE_AUDIT_EVIDENCE_PATH?.trim();if(output)writeFileSync(resolve(output),`${JSON.stringify(result,null,2)}\n`,{mode:0o600});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
function uuid(value){if(typeof value!=="string"||!/^[0-9a-f-]{36}$/i.test(value))throw new Error(`Invalid UUID in evidence: ${String(value)}`);return value;}
